import type { KabanosInstance } from '../core.js';
export function createNextHandler(instance:KabanosInstance){return (request:Request)=>instance.handler(request,request);}
