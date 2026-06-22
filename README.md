# Kabanos

Kabanos turns `TODO` and `FIXME` comments into a kanban board mounted inside an existing Node.js application. Source files are always read-only: resolving a card records state in the configured database and never rewrites the comment.

## Requirements

- Node.js 20 or newer
- An explicit host authorization guard, or an explicit public-mode opt-out

## Install and initialize

```sh
npm install kabanos
npx kabanos init
```

pnpm blocks native dependency install scripts unless explicitly approved. When pnpm reports that `better-sqlite3` was ignored, run `pnpm approve-builds` and approve that package before using the default SQLite adapter.

The initializer creates `kanban.config.ts` and `.kanban/`, then prints a framework-specific mounting snippet. It does not modify application source files. Add `.kanban/` to `.gitignore` when using SQLite.

## Runnable demo

```sh
npx pnpm demo
```

Open `http://127.0.0.1:3000/admin/kb`. The demo scans sample TypeScript, Python, Go, CSS, and HTML comments and persists board state under the ignored `demo/project/.kanban/` directory.

To restore all demo cards to their initial state:

```sh
npx pnpm demo:reset
```

## Express example

```ts
import express from 'express';
import config from './kanban.config.js';
import { createKabanos } from 'kabanos';
import { createExpressMiddleware } from 'kabanos/express';

const app = express();
app.use(express.json());

const kabanos = await createKabanos(config);
app.use(config.mountPath, createExpressMiddleware(kabanos));

const server = app.listen(3000);
process.once('SIGTERM', async () => {
  server.close();
  await kabanos.close();
});
```

Equivalent entrypoints are exported as `kabanos/fastify`, `kabanos/next`, and `kabanos/node`.

## Configuration

```ts
import { defineConfig } from 'kabanos';

export default defineConfig({
  projectRoot: process.cwd(),
  mountPath: '/admin/kb',
  columns: [
    { id: 'backlog', name: 'Backlog' },
    { id: 'in-progress', name: 'In Progress' },
    { id: 'done', name: 'Done', completion: true },
  ],
  scan: {
    include: ['src/**/*.{ts,tsx,js,jsx,py,go,rs,css,scss,html}'],
    exclude: ['**/*.test.*'],
    tags: {
      TODO: { column: 'backlog', priority: 'normal' },
      FIXME: { column: 'in-progress', priority: 'high' },
    },
    watch: process.env.NODE_ENV === 'development',
  },
  storage: { adapter: 'sqlite', filename: '.kanban/board.db' },
  theme: { default: 'system' },
  auth: {
    guard: request => request.user?.role === 'admin',
    actor: request => request.user
      ? { id: String(request.user.id), name: request.user.name }
      : undefined,
  },
});
```

Exactly one column must have `completion: true`. String-only column arrays remain supported; the final string becomes the completion column. UI changes are stored as database overrides without rewriting the configuration file.

For PostgreSQL or MySQL, select the corresponding adapter and provide `connectionString`. The `pg` and `mysql2` drivers are optional dependencies. All adapters run schema creation during startup; back up production databases before upgrading between pre-1.0 releases.

## Lifecycle and safety

- New tagged comments create cards.
- Moving or editing surrounding lines retains the card through content/context matching.
- Editing an open comment updates and flags its card.
- Deleting a comment archives its card on the next scan.
- Resolving a card stores its fingerprint and suppresses rediscovery.
- Editing a resolved comment changes its fingerprint and creates new work.
- Symlinks are not followed, configured ignores and `.gitignore` are honored, and source context access is confined to `projectRoot`.

The package does not contain a source-writing API.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm test:benchmark
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e
docker compose -f compose.test.yml up -d --wait
pnpm test:databases
docker compose -f compose.test.yml down -v
pnpm build
pnpm pack
```
