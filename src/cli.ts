import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import pc from 'picocolors';

const command = process.argv[2];
if (!command || ['-h', '--help', 'help'].includes(command)) {
  console.log(`kabanos\n\nUsage:\n  kabanos init   Create a configuration and print mount instructions\n  kabanos --help Show this help`);
  process.exit(0);
}
if (command !== 'init') { console.error(pc.red(`Unknown command: ${command}`)); process.exit(1); }

const root = process.cwd();
const target = path.join(root, 'kanban.config.ts');
const exists = await fileExists(target);
const answers = await prompts([
  { type: 'select', name: 'framework', message: 'Host framework', choices: [
    { title: 'Express', value: 'express' }, { title: 'Fastify', value: 'fastify' }, { title: 'Next.js route handler', value: 'next' }, { title: 'Node HTTP', value: 'node' },
  ] },
  { type: 'select', name: 'storage', message: 'Storage adapter', choices: [
    { title: 'SQLite (recommended)', value: 'sqlite' }, { title: 'PostgreSQL', value: 'postgres' }, { title: 'MySQL', value: 'mysql' },
  ] },
  { type: 'text', name: 'mountPath', message: 'Mount path', initial: '/admin/kb', validate: value => /^\/[\w/-]*$/.test(value) || 'Enter an absolute URL path.' },
  { type: 'confirm', name: 'public', message: 'Allow access without a host auth guard?', initial: false },
  ...(exists ? [{ type: 'confirm' as const, name: 'overwrite', message: 'kanban.config.ts exists. Replace it?', initial: false }] : []),
], { onCancel: () => { console.log(pc.yellow('Initialization cancelled.')); process.exit(1); } });

if (exists && !answers.overwrite) { console.log(pc.yellow('No files changed.')); process.exit(0); }
await mkdir(path.join(root, '.kanban'), { recursive: true });
await writeFile(target, configTemplate(answers.storage, answers.mountPath, answers.public));
console.log(pc.green('\nCreated kanban.config.ts and .kanban/'));
console.log(pc.bold('\nMount Kabanos in your application:\n'));
console.log(snippet(answers.framework, answers.mountPath));
console.log(pc.dim('\nAdd .kanban/ to .gitignore. The initializer did not modify host source files.'));

async function fileExists(file:string){try{await access(file);return true;}catch{return false;}}
function configTemplate(storage:string,mountPath:string,isPublic:boolean){return `import { defineConfig } from 'kabanos';\n\nexport default defineConfig({\n  projectRoot: process.cwd(),\n  mountPath: ${JSON.stringify(mountPath)},\n  storage: {\n    adapter: '${storage}',${storage==='sqlite'?"\n    filename: '.kanban/board.db',":"\n    connectionString: process.env.KANBAN_DB_URL,"}\n  },\n  scan: {\n    include: ['src/**/*.{ts,tsx,js,jsx,py,go,rs,css,scss,html}'],\n    watch: process.env.NODE_ENV === 'development',\n  },\n  auth: {\n    enabled: ${!isPublic},${isPublic?'':'\n    // Replace this with your host application authorization check.\n    guard: (request) => Boolean(request.user),\n    actor: (request) => request.user ? { id: String(request.user.id), name: request.user.name } : undefined,'}\n  },\n});\n`;}
function snippet(framework:string,mountPath:string){
  if(framework==='express')return `import config from './kanban.config.js';\nimport { createKabanos } from 'kabanos';\nimport { createExpressMiddleware } from 'kabanos/express';\n\nconst kabanos = await createKabanos(config);\napp.use(${JSON.stringify(mountPath)}, createExpressMiddleware(kabanos));`;
  if(framework==='fastify')return `import config from './kanban.config.js';\nimport { createKabanos } from 'kabanos';\nimport { kabanosFastify } from 'kabanos/fastify';\n\nconst kabanos = await createKabanos(config);\nawait app.register(kabanosFastify(kabanos));`;
  if(framework==='next')return `// app/admin/kb/[[...kabanos]]/route.ts\nimport config from '@/kanban.config';\nimport { createKabanos } from 'kabanos';\nimport { createNextHandler } from 'kabanos/next';\n\nconst handler = createNextHandler(await createKabanos(config));\nexport { handler as GET, handler as POST, handler as PATCH, handler as PUT };`;
  return `import { createServer } from 'node:http';\nimport config from './kanban.config.js';\nimport { createKabanos } from 'kabanos';\nimport { createNodeHandler } from 'kabanos/node';\n\nconst kabanos = await createKabanos(config);\ncreateServer(createNodeHandler(kabanos)).listen(3000);`;
}
