import path from 'node:path';
import { z } from 'zod';
import type { KanbanConfig, ResolvedKanbanConfig } from './types.js';

const schema = z.object({
  projectRoot: z.string().optional(), mountPath: z.string().regex(/^\/[\w/-]*$/).optional(), boardName: z.string().min(1).optional(),
  columns: z.array(z.union([z.string().min(1), z.object({ id: z.string().min(1), name: z.string().min(1), completion: z.boolean().optional(), colorToken: z.string().optional() })])).optional(),
  scan: z.object({ include: z.array(z.string()).optional(), exclude: z.array(z.string()).optional(), tags: z.record(z.string(), z.object({ column: z.string(), priority: z.enum(['low','normal','high']).optional(), label: z.string().optional() })).optional(), watch: z.boolean().optional(), intervalMs: z.number().int().nonnegative().optional(), maxFileSize: z.number().int().positive().optional(), parsers: z.array(z.custom<{extensions:string[];parse:Function}>(value=>Boolean(value)&&typeof value==='object'&&typeof (value as {parse?:unknown}).parse==='function')).optional() }).optional(),
  storage: z.object({ adapter: z.enum(['sqlite','postgres','mysql']).optional(), connectionString: z.string().optional(), filename: z.string().optional() }).optional(),
  theme: z.object({ default: z.enum(['light','dark','system']).optional(), overrides: z.record(z.string(), z.string()).optional() }).optional(),
  auth: z.object({ enabled: z.boolean().optional(), guard: z.function().optional(), actor: z.function().optional() }).optional(),
});

export function defineConfig<T = any>(config: KanbanConfig<T>): KanbanConfig<T> { return config; }

export function resolveConfig(input: KanbanConfig = {}): ResolvedKanbanConfig {
  const value = schema.parse(input) as KanbanConfig;
  const root = path.resolve(value.projectRoot ?? process.cwd());
  const columns = (value.columns ?? ['Backlog', 'In Progress', 'Done']).map((column, index, all) => typeof column === 'string'
    ? { id: column.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: column, completion: index === all.length - 1 }
    : column);
  if (columns.filter((column) => column.completion).length !== 1) throw new Error('Kabanos requires exactly one completion column.');
  const enabled = value.auth?.enabled ?? true;
  if (enabled && !value.auth?.guard) throw new Error('Kabanos requires auth.guard, or auth.enabled: false as an explicit public opt-out.');
  return {
    projectRoot: root, mountPath: value.mountPath ?? '/admin/kb', boardName: value.boardName ?? 'Code board', columns,
    scan: {
      include: value.scan?.include ?? ['**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,css,scss,html}'],
      exclude: value.scan?.exclude ?? ['node_modules/**','dist/**','build/**','.git/**','.kanban/**','**/*.min.*'],
      tags: value.scan?.tags ?? { TODO: { column: 'backlog', priority: 'normal' }, FIXME: { column: 'in-progress', priority: 'high' } },
      watch: value.scan?.watch ?? process.env.NODE_ENV === 'development', intervalMs: value.scan?.intervalMs ?? 0, maxFileSize: value.scan?.maxFileSize ?? 1_000_000, parsers: value.scan?.parsers ?? [],
    },
    storage: { adapter: value.storage?.adapter ?? 'sqlite', connectionString: value.storage?.connectionString ?? '', filename: path.resolve(root, value.storage?.filename ?? '.kanban/board.db') },
    theme: { default: value.theme?.default ?? 'system', overrides: value.theme?.overrides ?? {} }, auth: { enabled, ...value.auth },
  };
}
