// Deterministic streaming and cancellation in the real UI; no model calls or user data changes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const repo=process.cwd(),require=createRequire(resolve(repo,'apps/agent/package.json'));
const {chromium}=require('playwright'), output=resolve(repo,'../evaluation/chat-display-review-cancel');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'zh-CN',viewport:{width:2100,height:1100}});
await context.addInitScript(()=>{
 const original=window.fetch.bind(window),encoder=new TextEncoder();
 const qa=window.__chatQA={requests:[],streams:[],catalog:[],sourceReads:0,text:'第一段岗位推荐不会消失。',emit(index,event){try{qa.streams[index].enqueue(encoder.encode('data: '+JSON.stringify(event)+'\n\n'));return true;}catch{return false;}},finish(index){qa.emit(index,{type:'done'});qa.streams[index].close();}};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.pathname!=='/api/chat-agent')return original(input,options);
  const body=JSON.parse(options.body),index=qa.requests.length;
  const request={mode:body.mode,aborted:false};qa.requests.push(request);
  const stream=new ReadableStream({start(controller){qa.streams[index]=controller;options.signal?.addEventListener('abort',()=>{request.aborted=true;try{controller.error(new DOMException('Cancelled','AbortError'));}catch{}},{once:true});qa.emit(index,{type:'run_started'});qa.emit(index,{type:'llm_started',payload:{requestId:'model-'+index}});if(body.mode==='analyze')qa.emit(index,{type:'tool_started',payload:{toolName:'analyze_resume',toolCallId:'review-'+index}});else qa.emit(index,{type:'message_chunk',content:qa.text});}});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
 };
 window.addEventListener('resume-review:catalog',event=>{event.stopImmediatePropagation();qa.catalog.push(event.detail);});
 window.addEventListener('resume-review:read-source',()=>{qa.sourceReads++;});
});
await context.route('**/api/local-model-setup',r=>r.fulfill({status:204}));
await context.route('**/api/chat-agent/session?*',r=>r.fulfill({json:{data:{state:'active',checkpointId:'fixture-checkpoint'}}}));
const page=await context.newPage();page.setDefaultTimeout(25000);const checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.name+':'+e.message.slice(0,100)));
const entry=()=>page.getByRole('button',{name:'简历评估',exact:true});
const send=async text=>{await page.locator('textarea').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();};
async function waitSaved(resumeId,predicate){await page.waitForFunction(async({id,code})=>{const db=await new Promise(r=>{const q=indexedDB.open('MagicResumeDB',1);q.onsuccess=()=>r(q.result);});const value=await new Promise(r=>{const q=db.transaction('MagicResumeStore').objectStore('MagicResumeStore').get('ai-session:'+id);q.onsuccess=()=>r(q.result);});db.close();return new Function('session','return '+code)(value);},{id:resumeId,code:predicate});}
async function seed(chatUrl,mutate,payload){await page.goto('http://127.0.0.1:3000/robots.txt');await page.evaluate(async({id,code,payload})=>{const db=await new Promise(r=>{const q=indexedDB.open('MagicResumeDB',1);q.onsuccess=()=>r(q.result);});const get=key=>new Promise(r=>{const q=db.transaction('MagicResumeStore').objectStore('MagicResumeStore').get(key);q.onsuccess=()=>r(q.result);});const resumes=await get('resumes_data'),session=await get('ai-session:'+id);new Function('resumes','session','id','payload',code)(resumes,session,id,payload);await new Promise((r,j)=>{const tx=db.transaction('MagicResumeStore','readwrite'),store=tx.objectStore('MagicResumeStore');store.put(resumes,'resumes_data');store.put(session,'ai-session:'+id);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();},{id:chatUrl.split('/').at(-1),code:mutate,payload});await page.goto(chatUrl);}
try{
 await page.goto('http://127.0.0.1:3000/dashboard');await send('验证回复不会因工具调用消失');await page.waitForURL(/\/dashboard\/chat\//);const chatUrl=page.url(),resumeId=chatUrl.split('/').at(-1);
 await page.getByText('第一段岗位推荐不会消失。',{exact:true}).waitFor();
 await page.evaluate(()=>window.__chatQA.emit(0,{type:'tool_started',payload:{toolName:'find_matching_jobs',toolCallId:'jobs-1'}}));
 await waitSaved(resumeId,"session?.messages.some(m=>m.toolCalls?.some(t=>t.toolCallId==='jobs-1'))");
 assert.equal(await page.getByText('第一段岗位推荐不会消失。',{exact:true}).count(),1);
 await page.evaluate(()=>{const q=window.__chatQA;q.emit(0,{type:'tool_completed',payload:{toolCallId:'jobs-1'}});q.emit(0,{type:'llm_started',payload:{requestId:'model-next'}});q.emit(0,{type:'message_chunk',content:'第二段也会保留。'});q.emit(0,{type:'tool_started',payload:{toolName:'find_learning_courses',toolCallId:'courses-2'}});});
 await waitSaved(resumeId,"session?.messages.some(m=>m.toolCalls?.some(t=>t.toolCallId==='courses-2'))");
 await page.getByText('第一段岗位推荐不会消失。',{exact:true}).waitFor();await page.getByText('第二段也会保留。',{exact:true}).waitFor();
 await page.evaluate(()=>window.__chatQA.finish(0));await waitSaved(resumeId,"session?.messages.some(m=>m.role==='assistant'&&m.status==='done')");
 await page.reload();await page.getByText('第一段岗位推荐不会消失。',{exact:true}).waitFor();await page.getByText('第二段也会保留。',{exact:true}).waitFor();
 checks.push('assistant text survives successive tools, stream completion and reload without duplication');
 await seed(chatUrl,"const r=resumes.find(r=>r.id===id);r.info.fullName='测试用户';r.info.headline='产品经理';r.sections.projects=[{id:'project',visible:true,name:'流程验证',summary:'<p>负责需求梳理、用户访谈和发布复核，完成测试并记录问题。</p>'}];");
 for(const close of ['panel','header','toggle']){
  const before=await page.evaluate(()=>window.__chatQA.requests.length);await entry().click();await page.waitForFunction(n=>window.__chatQA.requests.length>n&&window.__chatQA.requests.at(-1).mode==='analyze',before);
  await page.locator('[data-evaluation-panel]').waitFor();
  if(close==='panel')await page.getByRole('button',{name:'关闭简历评估',exact:true}).click();
  else if(close==='header')await page.getByRole('button',{name:'关闭',exact:true}).click();
  else await entry().click();
  await page.waitForFunction(()=>window.__chatQA.requests.at(-1).aborted);
  await waitSaved(resumeId,"session?.messages.filter(m=>m.role==='assistant').at(-1)?.toolCalls?.every(t=>t.done&&t.error)");
  await page.locator('[data-evaluation-panel]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-evaluation-panel]').isVisible(),false);assert.equal(page.url(),chatUrl);
  await page.evaluate(()=>{const q=window.__chatQA;q.emit(q.requests.length-1,{type:'message_chunk',content:'取消后不该出现的结果'});});
  assert.equal(await page.getByText('取消后不该出现的结果',{exact:true}).count(),0);
  await page.waitForFunction(()=>!document.querySelector('[data-agent-chat] button[aria-label="停止生成"]'));
 }
 checks.push('panel X, header X and the evaluation toggle all cancel the evaluation request and reject late text');
 await page.evaluate(()=>window.__chatQA.text='正在执行独立的对话任务。');await send('继续普通对话');await page.getByText('正在执行独立的对话任务。',{exact:true}).waitFor();
 await entry().click();await page.getByRole('button',{name:'关闭简历评估',exact:true}).click();assert.equal(await page.evaluate(()=>window.__chatQA.requests.at(-1).aborted),false);await page.evaluate(()=>{const q=window.__chatQA;q.finish(q.requests.length-1);});
 await waitSaved(resumeId,"session?.messages.filter(m=>m.role==='assistant').at(-1)?.status==='done'");checks.push('closing a report does not cancel an unrelated chat task');
 const designId=randomUUID();await seed(chatUrl,"session.messages.push({id:'design-fixture',role:'assistant',content:'',status:'done',widget:{widgetId:'design-fixture',kind:'design_proposal',interaction:'client',status:'pending',props:{engine:'openpencil',sessionId:payload.designId,sourceHash:'b'.repeat(64),status:'ready',steps:[],rationale:'独立的取消准备阶段验证'}}});",{designId});
 const editor=page.frameLocator('iframe[title="OpenPencil 可编辑简历画布"]');await editor.locator('[data-test-id="editor-show-ui"]').waitFor();assert.equal(await editor.locator('[data-test-id="editor-toggle-chat"]').count(),0);checks.push('embedded canvas omits the duplicate sparkle chat button and retains its layer-panel control');
 const callsBefore=await page.evaluate(()=>window.__chatQA.requests.length);await entry().click();await page.waitForFunction(()=>window.__chatQA.catalog.length>0);await page.getByRole('button',{name:'关闭简历评估',exact:true}).click();
 await page.evaluate(()=>{const q=window.__chatQA,d=q.catalog.at(-1);window.dispatchEvent(new CustomEvent('resume-review:catalog-result',{detail:{...d,result:{frames:[{id:'frame',name:'测试简历',pageId:'page',pageName:'Page',width:595.28,height:841.89,textCount:10}]}}}));});
 await page.getByRole('button',{name:'发送',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__chatQA.requests.length),callsBefore);assert.equal(await page.evaluate(()=>window.__chatQA.sourceReads),0);await page.locator('[data-evaluation-panel]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-evaluation-panel]').isVisible(),false);checks.push('closing during canvas discovery prevents a delayed catalog result from starting an evaluation');
 await page.screenshot({path:resolve(output,'verified.png')});assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});await writeFile(resolve(output,'result.json'),JSON.stringify({passed:false,checks,errors,error:error.message},null,2));throw error;}
finally{await browser.close();}
