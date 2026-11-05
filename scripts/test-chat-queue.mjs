/** Real composer/queue/persistence with controlled streaming, without using a paid model. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'..'),require=createRequire(resolve(repo,'apps/agent/package.json')),{chromium}=require('playwright');
const out=resolve(process.env.QA_OUTPUT_DIR??resolve(repo,'../evaluation/full-regression-20261105/input-queue'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({locale:'zh-CN',viewport:{width:1500,height:1000}});
await context.addInitScript(()=>{
 const original=window.fetch.bind(window),encoder=new TextEncoder();
 const qa=window.__queueQA={requests:[],streams:[],emit(i,event){try{qa.streams[i].enqueue(encoder.encode('data: '+JSON.stringify(event)+'\n\n'));}catch{}},finish(i){qa.emit(i,{type:'done'});qa.streams[i].close();}};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname!=='/api/chat-agent')return original(input,options);
  const body=JSON.parse(options.body),index=qa.requests.length,request={body,aborted:false};qa.requests.push(request);
  return new Response(new ReadableStream({start(controller){qa.streams[index]=controller;options.signal?.addEventListener('abort',()=>{request.aborted=true;try{controller.error(new DOMException('Cancelled','AbortError'));}catch{}},{once:true});qa.emit(index,{type:'run_started'});qa.emit(index,{type:'message_chunk',content:'受控任务执行中 '+index});}}),{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
 };
});
await context.route('**/api/local-model-setup',r=>r.fulfill({status:204}));
await context.route('**/api/chat-agent/session?*',r=>r.fulfill({json:{data:{state:'active',checkpointId:'queue-fixture'}}}));
const page=await context.newPage();page.setDefaultTimeout(20000);const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const input=()=>page.locator('textarea').last();
async function send(text){await input().fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();}
async function queue(text){assert.equal(await input().isEditable(),true);await input().fill(text);await page.getByRole('button',{name:'加入待发送队列',exact:true}).click();}
async function requests(n){await page.waitForFunction(n=>window.__queueQA.requests.length===n,n);}
try{
 await page.goto('http://127.0.0.1:3000/dashboard');await send('开始第一项');await page.waitForURL(/\/chat\//);await requests(1);
 await queue('补充一：保留照片');await queue('补充二：正文不少于 9pt');
 assert.equal(await page.locator('[data-queued-input]').count(),2);assert.equal(await page.evaluate(()=>window.__queueQA.requests.length),1);
 await page.evaluate(()=>window.__queueQA.finish(0));await requests(2);
 assert.ok(JSON.stringify(await page.evaluate(()=>window.__queueQA.requests[1].body)).includes('补充一：保留照片'));
 assert.equal(await page.locator('[data-queued-input]').count(),1);
 await page.evaluate(()=>window.__queueQA.finish(1));await requests(3);
 assert.ok(JSON.stringify(await page.evaluate(()=>window.__queueQA.requests[2].body)).includes('补充二：正文不少于 9pt'));
 await page.evaluate(()=>window.__queueQA.finish(2));await page.getByRole('button',{name:'发送',exact:true}).waitFor();checks.push('typing stays enabled; multiple supplements wait and dispatch in FIFO order without overlap');
 await send('开始需要打断的任务');await requests(4);await queue('普通排队项');await queue('紧急更正：只改颜色');
 await page.locator('[data-queued-input]').filter({hasText:'紧急更正'}).getByRole('button',{name:'立即处理',exact:true}).click();await requests(5);
 assert.equal(await page.evaluate(()=>window.__queueQA.requests[3].aborted),true);
 assert.ok(JSON.stringify(await page.evaluate(()=>window.__queueQA.requests[4].body)).includes('紧急更正：只改颜色'));
 assert.equal(await page.locator('[data-queued-input]').count(),1);checks.push('send now cancels the active stream and prioritizes the selected supplement');
 await page.getByRole('button',{name:'停止生成',exact:true}).click();
 await page.getByText(/队列已暂停/).waitFor();assert.equal(await page.evaluate(()=>window.__queueQA.requests.length),5);
 await page.getByRole('button',{name:'继续队列',exact:true}).click();await requests(6);
 assert.ok(JSON.stringify(await page.evaluate(()=>window.__queueQA.requests[5].body)).includes('普通排队项'));
 await queue('不再发送的补充');await page.getByRole('button',{name:'移除待发送消息',exact:true}).click();assert.equal(await page.locator('[data-queued-input]').count(),0);
 await page.evaluate(()=>window.__queueQA.finish(5));await page.getByRole('button',{name:'发送',exact:true}).waitFor();checks.push('manual stop pauses the remaining queue; resume and remove work explicitly');
 await send('验证刷新前的队列');await requests(7);await queue('刷新后还要处理');await page.getByRole('button',{name:'停止生成',exact:true}).click();await page.getByText(/队列已暂停/).waitFor();
 // Wait until IndexedDB contains the pending item before reloading.
 await page.waitForFunction(async()=>{const id=location.pathname.split('/').at(-1),db=await new Promise(r=>{const q=indexedDB.open('MagicResumeDB',1);q.onsuccess=()=>r(q.result);});const s=await new Promise(r=>{const q=db.transaction('MagicResumeStore').objectStore('MagicResumeStore').get('ai-session:'+id);q.onsuccess=()=>r(q.result);});db.close();return s?.inputQueuePaused&&s.pendingInputs?.some(p=>p.text==='刷新后还要处理');});
 await page.reload();await page.getByText(/队列已暂停/).waitFor();assert.equal(await page.locator('[data-queued-input]').count(),1);
 assert.equal(await page.evaluate(()=>window.__queueQA.requests.length),0);await page.getByRole('button',{name:'继续队列',exact:true}).click();await requests(1);await page.evaluate(()=>window.__queueQA.finish(0));checks.push('paused queued input survives reload without sending itself');
 assert.deepEqual(errors,[]);await page.screenshot({path:resolve(out,'result.png')});await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'result.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}finally{await browser.close();}
