import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createKabanos, type KabanosInstance } from '../src/index.js';

describe('SQLite vertical slice', () => {
  let root = '';
  let instance: KabanosInstance | undefined;
  afterEach(async () => { await instance?.close(); if (root) await rm(root, { recursive: true, force: true }); });

  it('scans, serves, resolves, and suppresses a source comment without modifying it', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'kabanos-'));
    const sourcePath = path.join(root, 'app.ts');
    const source = '// TODO: add authentication\nexport const app = true;\n';
    await writeFile(sourcePath, source);
    instance = await createKabanos({ projectRoot: root, auth: { enabled: false }, scan: { watch: false } });

    const boardResponse = await instance.handler(new Request('http://localhost/admin/kb/api/v1/board'));
    const board = await boardResponse.json() as { cards: Array<{id:string}> };
    expect(board.cards).toHaveLength(1);

    const moveResponse = await instance.handler(new Request(`http://localhost/admin/kb/api/v1/cards/${board.cards[0]!.id}/move`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnId: 'done', position: 0 }),
    }));
    expect(moveResponse.status).toBe(200);
    const repeatMove = await instance.handler(new Request(`http://localhost/admin/kb/api/v1/cards/${board.cards[0]!.id}/move`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnId: 'done', position: 0 }),
    }));
    expect(repeatMove.status).toBe(200);
    expect(await instance.scan()).toEqual({ created: 0, updated: 0, archived: 0 });
    expect(await (await import('node:fs/promises')).readFile(sourcePath, 'utf8')).toBe(source);
  });

  it('returns structured not-found errors', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'kabanos-'));
    instance = await createKabanos({ projectRoot: root, auth: { enabled: false }, scan: { watch: false } });
    const response = await instance.handler(new Request('http://localhost/admin/kb/api/v1/cards/missing', { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({notes:'x'}) }));
    expect(response.status).toBe(404);expect(await response.json()).toEqual({error:{code:'CARD_NOT_FOUND',message:'Card not found.'}});
  });
});
