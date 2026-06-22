import { defineConfig } from 'tsup';

const shared = { format: 'esm' as const, dts: true, sourcemap: true, clean: false, target: 'node20', external: ['better-sqlite3', 'pg', 'mysql2', 'express', 'fastify'] };
export default defineConfig([
  { ...shared, entry: ['src/index.ts', 'src/adapters/*.ts'], splitting: true },
  { ...shared, entry: ['src/cli.ts'], splitting: false, banner: { js: '#!/usr/bin/env node' } },
]);
