import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar, { type FSWatcher } from 'chokidar';
import { z } from 'zod';
import { resolveConfig } from './config.js';
import { KabanosError } from './errors.js';
import { isWithin, ProjectScanner } from './scanner.js';
import { createStorage } from './storage.js';
import type { KanbanConfig, StorageAdapter } from './types.js';

export interface KabanosInstance {
  config: ReturnType<typeof resolveConfig>;
  storage: StorageAdapter;
  handler(request: Request, nativeRequest?: unknown): Promise<Response>;
  scan(): Promise<{ created: number; updated: number; archived: number }>;
  close(): Promise<void>;
}

export async function createKabanos<TRequest = any>(input: KanbanConfig<TRequest>): Promise<KabanosInstance> {
  const config = resolveConfig(input as KanbanConfig);
  const storage = await createStorage(config);
  await storage.initialize(config);
  let watcher: FSWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;
  let scanning: Promise<{created:number;updated:number;archived:number}> | undefined;
  const scanner = new ProjectScanner();
  const scan = () => scanning ??= storage.getBoard().then(board => {
    const overrides = (board.settings.scan ?? {}) as Partial<typeof config.scan>;
    return scanner.scan({ ...config, scan: { ...config.scan, ...overrides } });
  }).then(comments=>storage.reconcile(comments)).finally(()=>{scanning=undefined;});
  await scan();
  if(config.scan.watch){watcher=chokidar.watch(config.scan.include,{cwd:config.projectRoot,ignored:config.scan.exclude,ignoreInitial:true}).on('all',()=>{void scan();});}
  if(config.scan.intervalMs>0) timer=setInterval(()=>{void scan();},config.scan.intervalMs).unref();

  return {
    config, storage, scan,
    handler: (request,nativeRequest=request)=>handleRequest(request,nativeRequest,config,storage,scan),
    async close(){if(timer)clearInterval(timer);await watcher?.close();await storage.close();},
  };
}

async function handleRequest(request:Request,nativeRequest:unknown,config:ReturnType<typeof resolveConfig>,storage:StorageAdapter,scan:KabanosInstance['scan']):Promise<Response>{
  if(config.auth.enabled && !(await config.auth.guard?.(nativeRequest))) return json({error:{code:'UNAUTHORIZED',message:'Access denied.'}},401);
  const url=new URL(request.url); const mount=config.mountPath.replace(/\/$/,'');
  if(url.pathname===mount) return Response.redirect(`${url.origin}${mount}/`,308);
  if(!url.pathname.startsWith(`${mount}/`)) return json({error:{code:'NOT_FOUND',message:'Route not found.'}},404);
  const route=url.pathname.slice(mount.length);
  try{
    if(route==='/api/v1/board'&&request.method==='GET')return json(await storage.getBoard());
    if(route==='/api/v1/scan'&&request.method==='POST'){assertMutation(request);return json(await scan());}
    const move=route.match(/^\/api\/v1\/cards\/([^/]+)\/move$/);
    if(move&&request.method==='PATCH'){assertMutation(request);const body=moveSchema.parse(await request.json());await storage.moveCard(move[1]!,body.columnId,body.position,await config.auth.actor?.(nativeRequest));return json({ok:true});}
    const card=route.match(/^\/api\/v1\/cards\/([^/]+)$/);
    if(card&&request.method==='PATCH'){assertMutation(request);const body=cardSchema.parse(await request.json());await storage.updateCard(card[1]!,body,await config.auth.actor?.(nativeRequest));return json({ok:true});}
    const activity=route.match(/^\/api\/v1\/cards\/([^/]+)\/activity$/);
    if(activity&&request.method==='GET')return json(await storage.getActivity(activity[1]!));
    const context=route.match(/^\/api\/v1\/cards\/([^/]+)\/context$/);
    if(context&&request.method==='GET'){const board=await storage.getBoard();const selected=board.cards.find(c=>c.id===context[1]);if(!selected)return json({error:{code:'NOT_FOUND',message:'Card not found.'}},404);const absolute=path.resolve(config.projectRoot,selected.sourceFilePath);if(!isWithin(config.projectRoot,absolute))throw new Error('Unsafe source path.');const lines=(await readFile(absolute,'utf8')).split('\n');return json({filePath:selected.sourceFilePath,line:selected.sourceLine,lines:lines.slice(Math.max(0,selected.sourceLine-4),selected.sourceLine+3),startLine:Math.max(1,selected.sourceLine-3)});}
    if(route==='/api/v1/settings'&&request.method==='PATCH'){assertMutation(request);const body=settingsSchema.parse(await request.json());await storage.updateSettings(body);return json({ok:true});}
    if(route==='/api/v1/settings/columns'&&request.method==='PUT'){assertMutation(request);const body=columnsSchema.parse(await request.json());await storage.replaceColumns(body.columns,body.destinationColumnId);return json({ok:true});}
    if(request.method==='GET')return serveUi(route);
    return json({error:{code:'NOT_FOUND',message:'Route not found.'}},404);
  }catch(error){if(error instanceof z.ZodError)return json({error:{code:'INVALID_REQUEST',message:'Request validation failed.',issues:error.issues}},400);if(error instanceof KabanosError)return json({error:{code:error.code,message:error.message}},error.status);console.error('[kabanos]',error);return json({error:{code:'INTERNAL_ERROR',message:'Kabanos could not complete the request.'}},500);}
}

const moveSchema=z.object({columnId:z.string().min(1),position:z.number().int().nonnegative()});
const cardSchema=z.object({notes:z.string().max(20_000).optional(),assignee:z.string().max(255).nullable().optional(),labels:z.array(z.string().max(64)).max(20).optional()});
const settingsSchema=z.object({theme:z.enum(['light','dark','system']).optional(),tokenOverrides:z.record(z.string(),z.string()).optional(),scan:z.object({include:z.array(z.string()).optional(),exclude:z.array(z.string()).optional()}).optional()}).strict();
const columnsSchema=z.object({columns:z.array(z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.string().min(1).max(80),completion:z.boolean().optional(),colorToken:z.string().max(64).optional()})).min(1),destinationColumnId:z.string().optional()}).refine(value=>value.columns.filter(column=>column.completion).length===1,{message:'Exactly one completion column is required.'});
function assertMutation(request:Request){const content=request.headers.get('content-type')??'';if(!content.toLowerCase().startsWith('application/json'))throw new z.ZodError([{code:'custom',path:['content-type'],message:'Mutations require application/json.'}]);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new z.ZodError([{code:'custom',path:['origin'],message:'Cross-origin mutation rejected.'}]);}
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function serveUi(route:string):Promise<Response>{
  const moduleRoot=path.dirname(fileURLToPath(import.meta.url));
  const uiRoot=moduleRoot.endsWith(`${path.sep}src`)?path.resolve(moduleRoot,'../dist/ui'):path.resolve(moduleRoot,'ui');
  const requested=route==='/'?'index.html':route.replace(/^\//,'');
  let target=path.resolve(uiRoot,requested);if(!isWithin(uiRoot,target))return new Response('Not found',{status:404});
  try{const body=await readFile(target);return new Response(body,{headers:{'content-type':contentType(target),'cache-control':target.endsWith('index.html')?'no-cache':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'}});}catch{target=path.join(uiRoot,'index.html');try{return new Response(await readFile(target),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}});}catch{return new Response('Kabanos UI has not been built.',{status:503});}}
}
function contentType(file:string){if(file.endsWith('.html'))return'text/html; charset=utf-8';if(file.endsWith('.js'))return'text/javascript; charset=utf-8';if(file.endsWith('.css'))return'text/css; charset=utf-8';if(file.endsWith('.svg'))return'image/svg+xml';return'application/octet-stream';}
