import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { extractComments, ProjectScanner } from '../src/scanner.js';
import { resolveConfig } from '../src/config.js';

describe.skipIf(!process.env.KABANOS_BENCHMARK)('scanner performance',()=>{
  it('scans 5,000 files and reparses only a changed file',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'kabanos-benchmark-'));let reads=0;
    try{
      await Promise.all(Array.from({length:5000},(_,index)=>writeFile(path.join(root,`${index}.bench`),`// TODO item ${index}\n`)));
      const config=resolveConfig({projectRoot:root,auth:{enabled:false},scan:{include:['**/*.bench'],watch:false,parsers:[{extensions:['bench'],parse(file,source,tags){reads++;return extractComments(`${file}.ts`,source,tags).map(comment=>({...comment,filePath:file}));}}]}});
      const scanner=new ProjectScanner();const start=performance.now();expect(await scanner.scan(config)).toHaveLength(5000);expect(performance.now()-start).toBeLessThan(10_000);expect(reads).toBe(5000);
      await scanner.scan(config);expect(reads).toBe(5000);
      await new Promise(resolve=>setTimeout(resolve,10));await writeFile(path.join(root,'2500.bench'),'// TODO changed item\n');await scanner.scan(config);expect(reads).toBe(5001);
    }finally{await rm(root,{recursive:true,force:true});}
  },30_000);
});
