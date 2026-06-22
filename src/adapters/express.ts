import type { Request, RequestHandler, Response } from 'express';
import { Readable } from 'node:stream';
import type { KabanosInstance } from '../core.js';

export function createExpressMiddleware(instance:KabanosInstance):RequestHandler{return async(req:Request,res:Response,next)=>{try{const origin=`${req.protocol}://${req.get('host')??'localhost'}`;const body=['GET','HEAD'].includes(req.method)?undefined:req.body!==undefined?JSON.stringify(req.body):undefined;const request=new globalThis.Request(new URL(req.originalUrl,origin),{method:req.method,headers:req.headers as HeadersInit,body});const response=await instance.handler(request,req);res.status(response.status);response.headers.forEach((value,key)=>res.setHeader(key,value));if(response.body)Readable.fromWeb(response.body as never).pipe(res);else res.end();}catch(error){next(error);}};}
