import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createKabanos, type KabanosInstance } from '../src/index.js';
import { createNodeHandler } from '../src/adapters/node.js';
import { createExpressMiddleware } from '../src/adapters/express.js';
import { kabanosFastify } from '../src/adapters/fastify.js';

describe('framework adapters', () => {
  const roots:string[]=[];const instances:KabanosInstance[]=[];
  afterEach(async()=>{await Promise.all(instances.splice(0).map(instance=>instance.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
  async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'kabanos-adapter-'));roots.push(root);await writeFile(path.join(root,'app.ts'),'// TODO adapter');return root;}

  it('enforces host auth through the generic Node adapter', async () => {
    const instance=await createKabanos<IncomingMessage>({projectRoot:await fixture(),scan:{watch:false},auth:{guard:req=>req.headers.authorization==='Bearer test'}});instances.push(instance);
    const server=createServer(createNodeHandler(instance));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('Missing server address');const url=`http://127.0.0.1:${address.port}/admin/kb/api/v1/board`;
    expect((await fetch(url)).status).toBe(401);expect((await fetch(url,{headers:{authorization:'Bearer test'}})).status).toBe(200);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  });

  it('serves the board API through Express', async () => {
    const instance=await createKabanos({projectRoot:await fixture(),scan:{watch:false},auth:{enabled:false}});instances.push(instance);const app=express();app.use('/admin/kb',createExpressMiddleware(instance));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing server address');expect((await fetch(`http://127.0.0.1:${address.port}/admin/kb/api/v1/board`)).status).toBe(200);await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  });

  it('serves the board API through Fastify', async () => {
    const instance=await createKabanos({projectRoot:await fixture(),scan:{watch:false},auth:{enabled:false}});instances.push(instance);const app=Fastify();await app.register(kabanosFastify(instance));const response=await app.inject({method:'GET',url:'/admin/kb/api/v1/board'});expect(response.statusCode).toBe(200);await app.close();
  });
});
