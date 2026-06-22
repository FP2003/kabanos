import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { KabanosInstance } from '../core.js';

export function createNodeHandler(instance:KabanosInstance){return async(req:IncomingMessage,res:ServerResponse)=>{
  const forwarded=req.headers['x-forwarded-proto'];const protocol=forwarded?String(forwarded).split(',')[0]!.trim():(req.socket as {encrypted?:boolean}).encrypted?'https':'http';
  const origin=`${protocol}://${req.headers.host??'localhost'}`;
  const request=new Request(new URL(req.url??'/',origin),{method:req.method,headers:req.headers as HeadersInit,body:['GET','HEAD'].includes(req.method??'GET')?undefined:Readable.toWeb(req) as ReadableStream<Uint8Array>,duplex:'half'} as RequestInit);
  const response=await instance.handler(request,req);res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));if(response.body)Readable.fromWeb(response.body as never).pipe(res);else res.end();
};}
