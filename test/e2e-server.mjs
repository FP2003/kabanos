import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { createKabanos } from '../dist/index.js';
import { createExpressMiddleware } from '../dist/adapters/express.js';

const root=await mkdtemp(path.join(os.tmpdir(),'kabanos-e2e-'));
await writeFile(path.join(root,'app.ts'),'// TODO: test keyboard dragging\n// FIXME: test details\n');
const kabanos=await createKabanos({projectRoot:root,auth:{enabled:false},scan:{watch:false}});
const app=express();app.use(express.json());app.use('/admin/kb',createExpressMiddleware(kabanos));
const server=app.listen(4178,'127.0.0.1');
async function close(){await new Promise(resolve=>server.close(resolve));await kabanos.close();await rm(root,{recursive:true,force:true});process.exit(0);}
process.once('SIGTERM',()=>{void close();});process.once('SIGINT',()=>{void close();});
