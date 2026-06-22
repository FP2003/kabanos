import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createKabanos } from '../dist/index.js';
import { createExpressMiddleware } from '../dist/adapters/express.js';

const demoRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(demoRoot, 'project');
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const kabanos = await createKabanos({
  projectRoot,
  boardName: 'Kabanos Demo',
  mountPath: '/admin/kb',
  scan: {
    include: ['src/**/*.{ts,tsx,js,jsx,py,go,rs,css,scss,html}'],
    watch: true,
    tags: {
      TODO: { column: 'backlog', priority: 'normal' },
      FIXME: { column: 'in-progress', priority: 'high' },
      HACK: { column: 'backlog', priority: 'low', label: 'tech-debt' },
    },
  },
  storage: { adapter: 'sqlite', filename: '.kanban/demo.db' },
  auth: { enabled: false },
});

const app = express();
app.use(express.json());
app.get('/', (_request, response) => response.redirect('/admin/kb'));
app.use('/admin/kb', createExpressMiddleware(kabanos));

const server = app.listen(port, host, () => {
  console.log(`\nKabanos demo is running at http://${host}:${port}/admin/kb`);
  console.log('Press Ctrl+C to stop. Run "npx pnpm demo:reset" to clear board state.\n');
});

async function shutdown() {
  await new Promise(resolve => server.close(resolve));
  await kabanos.close();
}

process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
