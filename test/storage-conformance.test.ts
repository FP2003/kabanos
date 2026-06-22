import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { createKabanos } from '../src/index.js';
import type { StorageConfig } from '../src/types.js';

const adapters:Array<{name:string;config:StorageConfig|undefined}>=[
  {name:'PostgreSQL',config:process.env.KABANOS_TEST_POSTGRES?{adapter:'postgres',connectionString:process.env.KABANOS_TEST_POSTGRES}:undefined},
  {name:'MySQL',config:process.env.KABANOS_TEST_MYSQL?{adapter:'mysql',connectionString:process.env.KABANOS_TEST_MYSQL}:undefined},
];

describe('external storage conformance',()=>{
  for(const adapter of adapters){
    it.skipIf(!adapter.config)(`${adapter.name} supports the scan and resolution lifecycle`,async()=>{
      const root=await mkdtemp(path.join(os.tmpdir(),'kabanos-db-'));await writeFile(path.join(root,'a.ts'),'// TODO external database');
      const instance=await createKabanos({projectRoot:root,auth:{enabled:false},scan:{watch:false},storage:adapter.config});
      try{const board=await instance.storage.getBoard();expect(board.cards).toHaveLength(1);await instance.storage.moveCard(board.cards[0]!.id,'done',0);expect(await instance.scan()).toEqual({created:0,updated:0,archived:0});}
      finally{await instance.close();await rm(root,{recursive:true,force:true});}
    },30_000);
  }
});
