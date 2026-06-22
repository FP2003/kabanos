import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createKabanos, type KabanosInstance } from '../src/index.js';

describe('column management', () => {
  let root = ''; let instance: KabanosInstance | undefined;
  afterEach(async()=>{await instance?.close();if(root)await rm(root,{recursive:true,force:true});});
  it('requires a destination when removing a populated column', async () => {
    root=await mkdtemp(path.join(os.tmpdir(),'kabanos-columns-'));await writeFile(path.join(root,'a.ts'),'// TODO keep me');
    instance=await createKabanos({projectRoot:root,auth:{enabled:false},scan:{watch:false}});
    await expect(instance.storage.replaceColumns([{id:'done',name:'Done',completion:true}])).rejects.toThrow(/destination/);
    await instance.storage.replaceColumns([{id:'queue',name:'Queue'},{id:'done',name:'Done',completion:true}],'queue');
    const board=await instance.storage.getBoard();expect(board.cards[0]?.columnId).toBe('queue');expect(board.columns.filter(column=>column.completion)).toHaveLength(1);
  });
});
