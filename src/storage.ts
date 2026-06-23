import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, sql } from 'kysely';
import { KabanosError } from './errors.js';
import type { Actor, BoardState, Card, ColumnConfig, ResolvedKanbanConfig, SourceComment, StorageAdapter } from './types.js';

interface DB {
  schema_migrations: { version: number; applied_at: string };
  boards: { id: string; name: string; created_at: string };
  columns: { id: string; board_id: string; name: string; position: number; completion: number; color_token: string | null };
  cards: { id: string; board_id: string; column_id: string; position: number; tag: string; title: string; body: string; notes: string; assignee: string | null; labels: string; priority: string; source_file_path: string; source_line: number; source_content_hash: string; source_context_hash: string; source_occurrence: number; status: string; created_at: string; updated_at: string };
  resolved_fingerprints: { id: string; board_id: string; card_id: string; file_path: string; content_hash: string; context_hash: string; occurrence: number; resolved_at: string; resolved_by: string | null };
  settings: { board_id: string; value: string };
  activity_log: { id: string; card_id: string; action: string; from_status: string | null; to_status: string | null; actor: string | null; created_at: string };
}

export class SqlStorage implements StorageAdapter {
  constructor(private readonly db: Kysely<DB>, private readonly config: ResolvedKanbanConfig) {}

  async migrate(): Promise<void> {
    await this.db.schema.createTable('schema_migrations').ifNotExists().addColumn('version','integer',c=>c.primaryKey()).addColumn('applied_at','varchar(32)',c=>c.notNull()).execute();
    const applied = new Set((await this.db.selectFrom('schema_migrations').select('version').execute()).map(r=>r.version));
    const migrations: Array<{version:number;up:(db:Kysely<DB>)=>Promise<void>}> = [
      { version: 1, up: async db => {
        await db.schema.createTable('boards').ifNotExists().addColumn('id','varchar(64)',c=>c.primaryKey()).addColumn('name','varchar(255)',c=>c.notNull()).addColumn('created_at','varchar(32)',c=>c.notNull()).execute();
        await db.schema.createTable('columns').ifNotExists().addColumn('id','varchar(64)',c=>c.primaryKey()).addColumn('board_id','varchar(64)',c=>c.notNull()).addColumn('name','varchar(255)',c=>c.notNull()).addColumn('position','integer',c=>c.notNull()).addColumn('completion','integer',c=>c.notNull()).addColumn('color_token','varchar(64)').execute();
        await db.schema.createTable('cards').ifNotExists().addColumn('id','varchar(64)',c=>c.primaryKey()).addColumn('board_id','varchar(64)',c=>c.notNull()).addColumn('column_id','varchar(64)',c=>c.notNull()).addColumn('position','integer',c=>c.notNull()).addColumn('tag','varchar(64)',c=>c.notNull()).addColumn('title','text',c=>c.notNull()).addColumn('body','text',c=>c.notNull()).addColumn('notes','text',c=>c.notNull()).addColumn('assignee','varchar(255)').addColumn('labels','text',c=>c.notNull()).addColumn('priority','varchar(32)',c=>c.notNull()).addColumn('source_file_path','text',c=>c.notNull()).addColumn('source_line','integer',c=>c.notNull()).addColumn('source_content_hash','varchar(64)',c=>c.notNull()).addColumn('source_context_hash','varchar(64)',c=>c.notNull()).addColumn('source_occurrence','integer',c=>c.notNull()).addColumn('status','varchar(32)',c=>c.notNull()).addColumn('created_at','varchar(32)',c=>c.notNull()).addColumn('updated_at','varchar(32)',c=>c.notNull()).execute();
        await db.schema.createTable('resolved_fingerprints').ifNotExists().addColumn('id','varchar(64)',c=>c.primaryKey()).addColumn('board_id','varchar(64)',c=>c.notNull()).addColumn('card_id','varchar(64)',c=>c.notNull()).addColumn('file_path','text',c=>c.notNull()).addColumn('content_hash','varchar(64)',c=>c.notNull()).addColumn('context_hash','varchar(64)',c=>c.notNull()).addColumn('occurrence','integer',c=>c.notNull()).addColumn('resolved_at','varchar(32)',c=>c.notNull()).addColumn('resolved_by','varchar(255)').execute();
        await db.schema.createTable('settings').ifNotExists().addColumn('board_id','varchar(64)',c=>c.primaryKey()).addColumn('value','text',c=>c.notNull()).execute();
        await db.schema.createTable('activity_log').ifNotExists().addColumn('id','varchar(64)',c=>c.primaryKey()).addColumn('card_id','varchar(64)',c=>c.notNull()).addColumn('action','varchar(64)',c=>c.notNull()).addColumn('from_status','varchar(32)').addColumn('to_status','varchar(32)').addColumn('actor','varchar(255)').addColumn('created_at','varchar(32)',c=>c.notNull()).execute();
      }},
    ];
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await migration.up(this.db);
      await this.db.insertInto('schema_migrations').values({version:migration.version,applied_at:new Date().toISOString()}).execute();
    }
  }

  async initialize(config: ResolvedKanbanConfig): Promise<void> {
    await this.migrate();
    const board = await this.db.selectFrom('boards').selectAll().where('id','=','default').executeTakeFirst();
    if (board) return;
    const now = new Date().toISOString();
    await this.db.transaction().execute(async trx => {
      await trx.insertInto('boards').values({ id:'default', name:config.boardName, created_at:now }).execute();
      await trx.insertInto('columns').values(config.columns.map((column, position) => ({ id:column.id, board_id:'default', name:column.name, position, completion:column.completion ? 1 : 0, color_token:column.colorToken ?? null }))).execute();
      await trx.insertInto('settings').values({ board_id:'default', value:JSON.stringify({ theme:config.theme.default, tokenOverrides:config.theme.overrides, scan:{include:config.scan.include,exclude:config.scan.exclude} }) }).execute();
    });
  }

  async getBoard(): Promise<BoardState> {
    const [board, columns, cards, settings] = await Promise.all([
      this.db.selectFrom('boards').selectAll().where('id','=','default').executeTakeFirstOrThrow(),
      this.db.selectFrom('columns').selectAll().where('board_id','=','default').orderBy('position').execute(),
      this.db.selectFrom('cards').selectAll().where('board_id','=','default').where('status','!=','archived').orderBy('position').execute(),
      this.db.selectFrom('settings').selectAll().where('board_id','=','default').executeTakeFirst(),
    ]);
    return { id:board.id, name:board.name, columns:columns.map(c=>({ id:c.id,name:c.name,position:c.position,completion:Boolean(c.completion),...(c.color_token ? {colorToken:c.color_token}: {}) })), cards:cards.map(toCard), settings:JSON.parse(settings?.value ?? '{}') as Record<string,unknown> };
  }

  async reconcile(comments: SourceComment[]): Promise<{created:number;updated:number;archived:number}> {
    return this.db.transaction().execute(async trx => {
      const [cards, resolved, columns] = await Promise.all([
        trx.selectFrom('cards').selectAll().where('board_id','=','default').execute(),
        trx.selectFrom('resolved_fingerprints').selectAll().where('board_id','=','default').execute(),
        trx.selectFrom('columns').selectAll().where('board_id','=','default').execute(),
      ]);
      const seen = new Set<string>(); const createdPerColumn = new Map<string,number>(); let updated=0, archived=0;
      for (const comment of comments) {
        const exact = cards.find(c=>c.source_file_path===comment.filePath && c.source_content_hash===comment.contentHash && c.source_occurrence===comment.occurrence && c.status!=='archived');
        if (exact) { seen.add(exact.id); if (exact.source_line!==comment.line || exact.source_context_hash!==comment.contextHash) { await trx.updateTable('cards').set({source_line:comment.line,source_context_hash:comment.contextHash,updated_at:new Date().toISOString()}).where('id','=',exact.id).execute(); updated++; } continue; }
        const suppressed = resolved.some(r=>r.file_path===comment.filePath && r.content_hash===comment.contentHash && r.occurrence===comment.occurrence);
        if (suppressed) continue;
        const changed = cards.filter(c=>c.source_file_path===comment.filePath && !seen.has(c.id) && c.status!=='resolved' && c.status!=='archived').sort((a,b)=>Number(b.source_context_hash===comment.contextHash)-Number(a.source_context_hash===comment.contextHash)||Math.abs(a.source_line-comment.line)-Math.abs(b.source_line-comment.line))[0];
        if (changed) { seen.add(changed.id); await trx.updateTable('cards').set({tag:comment.tag,title:comment.text,body:comment.rawText,source_line:comment.line,source_content_hash:comment.contentHash,source_context_hash:comment.contextHash,status:'changed',updated_at:new Date().toISOString()}).where('id','=',changed.id).execute(); updated++; continue; }
        const tag = this.config.scan.tags[comment.tag];
        const column = columns.find(c=>c.id===tag?.column) ?? columns[0];
        if (!column) throw new Error('Board has no columns.');
        const colCreated = createdPerColumn.get(column.id) ?? 0;
        const id=randomUUID(), now=new Date().toISOString();
        await trx.insertInto('cards').values({id,board_id:'default',column_id:column.id,position:cards.filter(c=>c.column_id===column.id).length+colCreated,tag:comment.tag,title:comment.text,body:comment.rawText,notes:'',assignee:null,labels:JSON.stringify(tag?.label?[tag.label]:[]),priority:tag?.priority??'normal',source_file_path:comment.filePath,source_line:comment.line,source_content_hash:comment.contentHash,source_context_hash:comment.contextHash,source_occurrence:comment.occurrence,status:'open',created_at:now,updated_at:now}).execute();
        await log(trx,id,'created',null,'open',undefined); seen.add(id); createdPerColumn.set(column.id,colCreated+1);
      }
      for (const card of cards.filter(c=>c.status!=='archived' && !seen.has(c.id))) { await trx.updateTable('cards').set({status:'archived',updated_at:new Date().toISOString()}).where('id','=',card.id).execute(); await log(trx,card.id,'archived',card.status,'archived',undefined); archived++; }
      const created = [...createdPerColumn.values()].reduce((a,b)=>a+b,0);
      return {created,updated,archived};
    });
  }

  async moveCard(id:string,columnId:string,position:number,actor?:Actor):Promise<void> {
    await this.db.transaction().execute(async trx=>{
      const [card,column]=await Promise.all([trx.selectFrom('cards').selectAll().where('id','=',id).executeTakeFirst(),trx.selectFrom('columns').selectAll().where('id','=',columnId).executeTakeFirst()]);
      if(!card)throw new KabanosError('CARD_NOT_FOUND','Card not found.',404);if(!column)throw new KabanosError('COLUMN_NOT_FOUND','Column not found.',404);
      const status=column.completion?'resolved':'open', now=new Date().toISOString();
      const target=await trx.selectFrom('cards').selectAll().where('column_id','=',columnId).where('status','!=','archived').orderBy('position').execute();
      const ordered=target.filter(item=>item.id!==id);ordered.splice(Math.min(position,ordered.length),0,{...card,column_id:columnId});
      for(const [index,item] of ordered.entries())await trx.updateTable('cards').set({column_id:columnId,position:index,...(item.id===id?{status,updated_at:now}:{})}).where('id','=',item.id).execute();
      if(card.column_id!==columnId){const source=await trx.selectFrom('cards').selectAll().where('column_id','=',card.column_id).where('id','!=',id).where('status','!=','archived').orderBy('position').execute();for(const [index,item]of source.entries())await trx.updateTable('cards').set({position:index}).where('id','=',item.id).execute();}
      await trx.deleteFrom('resolved_fingerprints').where('card_id','=',id).execute();
      if (status==='resolved') await trx.insertInto('resolved_fingerprints').values({id:randomUUID(),board_id:'default',card_id:id,file_path:card.source_file_path,content_hash:card.source_content_hash,context_hash:card.source_context_hash,occurrence:card.source_occurrence,resolved_at:now,resolved_by:actor?.id??null}).execute();
      await log(trx,id,status==='resolved'?'resolved':'moved',card.status,status,actor);
    });
  }
  async updateCard(id:string,patch:{notes?:string;assignee?:string|null;labels?:string[]},actor?:Actor):Promise<void>{ const values:Record<string,unknown>={updated_at:new Date().toISOString()}; if(patch.notes!==undefined)values.notes=patch.notes;if(patch.assignee!==undefined)values.assignee=patch.assignee;if(patch.labels!==undefined)values.labels=JSON.stringify(patch.labels);const result=await this.db.updateTable('cards').set(values).where('id','=',id).executeTakeFirst();if(Number(result.numUpdatedRows)===0)throw new KabanosError('CARD_NOT_FOUND','Card not found.',404);await log(this.db,id,'updated',null,null,actor); }
  async getActivity(cardId:string):Promise<unknown[]>{return this.db.selectFrom('activity_log').selectAll().where('card_id','=',cardId).orderBy('created_at','desc').execute();}
  async updateSettings(patch:Record<string,unknown>):Promise<void>{const current=await this.db.selectFrom('settings').select('value').where('board_id','=','default').executeTakeFirst();await this.db.updateTable('settings').set({value:JSON.stringify({...JSON.parse(current?.value??'{}'),...patch})}).where('board_id','=','default').execute();}
  async replaceColumns(columns:ColumnConfig[],destinationColumnId?:string):Promise<void>{
    if(columns.length===0||columns.filter(column=>column.completion).length!==1)throw new KabanosError('INVALID_COLUMNS','Exactly one completion column is required.');
    if(new Set(columns.map(column=>column.id)).size!==columns.length)throw new KabanosError('INVALID_COLUMNS','Column IDs must be unique.');
    await this.db.transaction().execute(async trx=>{
      const existing=await trx.selectFrom('columns').selectAll().where('board_id','=','default').execute();
      const removed=existing.filter(column=>!columns.some(next=>next.id===column.id));
      if(removed.length){const count=await trx.selectFrom('cards').select(sql<number>`count(*)`.as('count')).where('column_id','in',removed.map(column=>column.id)).where('status','!=','archived').executeTakeFirst();if(Number(count?.count??0)>0){if(!destinationColumnId||!columns.some(column=>column.id===destinationColumnId))throw new KabanosError('COLUMN_DESTINATION_REQUIRED','A valid destination column is required when deleting a populated column.',409);await trx.updateTable('cards').set({column_id:destinationColumnId,updated_at:new Date().toISOString()}).where('column_id','in',removed.map(column=>column.id)).execute();}}
      await trx.deleteFrom('columns').where('board_id','=','default').execute();
      await trx.insertInto('columns').values(columns.map((column,position)=>({id:column.id,board_id:'default',name:column.name,position,completion:column.completion?1:0,color_token:column.colorToken??null}))).execute();
    });
  }
  async close():Promise<void>{await this.db.destroy();}
}

export async function createStorage(config:ResolvedKanbanConfig):Promise<SqlStorage>{
  let dialect;
  if(config.storage.adapter==='sqlite'){await mkdir(path.dirname(config.storage.filename),{recursive:true});dialect=new SqliteDialect({database:new Database(config.storage.filename)});}
  else if(config.storage.adapter==='postgres'){const {Pool}=await import('pg');dialect=new PostgresDialect({pool:new Pool({connectionString:config.storage.connectionString})});}
  else {const mysql=await import('mysql2');dialect=new MysqlDialect({pool:mysql.createPool(config.storage.connectionString)});}
  return new SqlStorage(new Kysely<DB>({dialect}),config);
}

function toCard(row:DB['cards']):Card{return{id:row.id,columnId:row.column_id,position:row.position,tag:row.tag,title:row.title,body:row.body,notes:row.notes,...(row.assignee?{assignee:row.assignee}:{}),labels:JSON.parse(row.labels) as string[],priority:row.priority,sourceFilePath:row.source_file_path,sourceLine:row.source_line,sourceContentHash:row.source_content_hash,sourceContextHash:row.source_context_hash,sourceOccurrence:row.source_occurrence,status:row.status as Card['status'],createdAt:row.created_at,updatedAt:row.updated_at};}
async function log(db:Kysely<DB>|any,cardId:string,action:string,from:string|null,to:string|null,actor?:Actor){await db.insertInto('activity_log').values({id:randomUUID(),card_id:cardId,action,from_status:from,to_status:to,actor:actor?.id??null,created_at:new Date().toISOString()}).execute();}
