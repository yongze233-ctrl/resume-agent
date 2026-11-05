export type DiagnosticComponent = 'window'|'promise'|'app'|'dashboard'|'global'|'upload'|'chat'|'design'|'export'|'import'|'storage'|'canvas';
type Frame = {file:string;line:number;column:number};
type DiagnosticInput = {error?:unknown;component:DiagnosticComponent;category?:'javascript'|'react'|'resource'|'operation';code?:string;status?:number;format?:'doc'|'docx'|'pdf'|'image'|'json'|'other';stack?:string};
const names=new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','DOMException','NetworkError','ChunkLoadError']);
const framePath=/^\/(?:_next\/static\/|pencil\/assets\/)[A-Za-z0-9_./@%+~-]+\.(?:js|css)$/;
export function diagnosticRoute(path:string) {
  if(path==='/login')return 'login';if(path==='/dashboard'||path==='/')return 'home';
  if(path.startsWith('/dashboard/chat/'))return 'chat';if(path.startsWith('/dashboard/edit/'))return 'editor';
  if(path.startsWith('/dashboard/learning'))return 'learning';if(path.startsWith('/dashboard/resumes'))return 'resumes';
  if(path.startsWith('/dashboard/admin/'))return 'admin';if(path.startsWith('/dashboard/account'))return 'account';return 'other';
}
export function diagnosticFrames(stack:string,origin:string):Frame[] {
  const frames:Frame[]=[];
  for(const match of stack.matchAll(/((?:https?:\/\/)[^\s()]+):(\d+):(\d+)/g)) {
    try {const url=new URL(match[1]);if(url.origin===origin&&framePath.test(url.pathname)&&url.pathname.length<=220)frames.push({file:url.pathname,line:Math.min(Number(match[2]),10000000),column:Math.min(Number(match[3]),10000000)});}catch{/* Unrecognized stack frames carry no useful code location. */}
    if(frames.length===8)break;
  }
  return frames;
}
/** Construct an allowlisted report. Raw messages, URL queries and arbitrary error properties never cross this boundary. */
export async function makeFrontendDiagnostic(input:DiagnosticInput,context:{origin:string;path:string;build:string}) {
  const error=input.error&&typeof input.error==='object'?input.error as {name?:unknown;stack?:unknown}:{};
  if(error.name==='AbortError')return null;
  const name=typeof error.name==='string'&&names.has(error.name)?error.name:'Other';
  const code=input.code&&/^[a-z][a-z0-9_]{0,79}$/.test(input.code)?input.code:'uncaught_error';
  const stack=input.stack??(typeof error.stack==='string'?error.stack:'');
  const frames=diagnosticFrames(stack,context.origin);
  const category=input.category??'javascript';
  const identity=JSON.stringify({component:input.component,category,name,code,frames});
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  return {version:1,eventId:crypto.randomUUID(),fingerprint:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),category,component:input.component,name,code,route:diagnosticRoute(context.path),build:/^[A-Za-z0-9._-]{1,100}$/.test(context.build)?context.build:'unknown',frames,
    ...(input.status&&input.status>=100&&input.status<=599?{status:input.status}:{}),...(input.format?{format:input.format}:{})};
}
const recent=new Map<string,number>();let windowStart=0,sent=0;
export function reportFrontendError(input:DiagnosticInput):void {
  if(typeof window==='undefined')return;
  void (async()=>{
    const report=await makeFrontendDiagnostic(input,{origin:location.origin,path:location.pathname,build:process.env.NEXT_PUBLIC_RELEASE_ID??'unknown'});
    if(!report)return;const now=Date.now();
    if(now-windowStart>60000){windowStart=now;sent=0;recent.clear();}
    if(sent>=20||now-(recent.get(report.fingerprint)??0)<60000)return;
    sent++;recent.set(report.fingerprint,now);
    await fetch('/api/diagnostics/frontend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report),credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(4000)});
  })().catch(()=>{/* Reporting cannot block or recursively fail the product. */});
}
let installed=false;
export function installFrontendReporting() {
  if(typeof window==='undefined'||installed)return;installed=true;
  window.addEventListener('error',(event:ErrorEvent)=>{
    const resource=event.target instanceof HTMLScriptElement||event.target instanceof HTMLLinkElement;
    const url=event.target instanceof HTMLScriptElement?event.target.src:event.target instanceof HTMLLinkElement?event.target.href:'';
    reportFrontendError({component:'window',category:resource?'resource':'javascript',error:event.error,code:resource?'asset_load_failed':'uncaught_error',stack:event.error?.stack??(url?`${url}:0:0`:event.filename?`${event.filename}:${event.lineno}:${event.colno}`:'')});
  },true);
  window.addEventListener('unhandledrejection',(event:PromiseRejectionEvent)=>reportFrontendError({error:event.reason,component:'promise',code:'unhandled_rejection'}));
  window.addEventListener('message',(event:MessageEvent)=>{
    if(event.origin!==location.origin||event.data?.type!=='magic-resume:diagnostic')return;
    const trusted=Array.from(document.querySelectorAll('iframe')).some(frame=>{
      try{return frame.contentWindow===event.source&&new URL(frame.src,location.href).searchParams.get('magic_resume')===event.data.channel;}catch{return false;}
    });
    if(trusted)reportFrontendError({error:event.data.diagnostic,component:'canvas',code:'canvas_uncaught_error'});
  });
}
