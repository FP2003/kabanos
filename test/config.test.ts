import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('requires an intentional auth choice', () => {
    expect(() => resolveConfig({})).toThrow(/auth\.guard/);
  });

  it('creates stable default columns and one completion column', () => {
    const config = resolveConfig({ auth: { enabled: false } });
    expect(config.columns.map(column => column.id)).toEqual(['backlog', 'in-progress', 'done']);
    expect(config.columns.filter(column => column.completion)).toHaveLength(1);
  });

  it('rejects ambiguous completion semantics', () => {
    expect(() => resolveConfig({ auth: { enabled: false }, columns: [{ id: 'a', name: 'A' }] })).toThrow(/completion column/);
  });
});
