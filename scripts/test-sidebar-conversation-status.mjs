/** Sidebar feedback follows controlled real UI requests; no model or credentials are used. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const repo=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(resolve(repo,'apps/agent/package.json')),{chromium}=require('playwright'),output=resolve(repo,'../evaluation/sidebar-conversation-status');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({locale:'zh-CN',viewport:{width:1450,height:1000},reducedMotion:'no-preference'}),page=await context.newPage();page.setDefaultTimeout(18000);
const states=new Map(),errors=[],checks=[];let pending;
page.on('pageerror',e=>errors.push(e.name));
await context.route('**/api/local-model-setup',r=>r.fulfill({status:204}));
await context.route('**/api/site-model',r=>r.fulfill({status:200,json:{provider:'opencode-go',model:'deepseek-v4.1-flash',baseUrl:'https://opencode.ai/zen/go/v1',maxTokens:12000}}));
await context.route('**/api/diagnostics/frontend',r=>r.fulfill({status:202,json:{accepted:true}}));
await context.route('**/api/chat-agent/session?*',r=>{const id=new URL(r.request().url()).searchParams.get('sessionId');return r.fulfill({status:200,json:{data:states.get(id)??{state:'not_found'}}});});
await context.route('**/api/chat-agent',async route=>{
  const body=route.request().postDataJSON();let release;const gate=new Promise(resolve=>{release=resolve;});const job={id:body.sessionId,release};pending=job;const value=await gate;states.set(job.id,value.state??{state:'active',checkpointId:'completed'});
  try{if(value.status)await route.fulfill({status:value.status,json:{errorCode:'upstream_unavailable',subCode:'model_unavailable',retryable:true}});else await route.fulfill({status:200,contentType:'text/event-stream; charset=utf-8',body:value.events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});}catch{/* Stop/navigation aborts the original browser request. */}
  if(pending===job)pending=null;
});
const completed=[{type:'run_started'},{type:'message_chunk',content:'这轮处理完成。'},{type:'done'}];
let active;
async function start(title){await page.goto('http://127.0.0.1:3000/dashboard');await page.locator('textarea').fill(title);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForURL(/\/dashboard\/chat\//);active=page.locator('nav[aria-label="最近对话"] a').filter({hasText:title.slice(0,26)});await active.getByRole('status',{name:'正在处理',exact:true}).waitFor();assert.ok(pending);return pending;}
const hidden=()=>active.getByRole('status',{name:'正在处理',exact:true}).waitFor({state:'detached'});
try{
 let job=await start('检查长对话标题旁的任务运行状态，文字过长时也应该能看见转圈提醒');
 const ring=active.getByRole('status',{name:'正在处理',exact:true}).locator('span');assert.notEqual(await ring.evaluate(el=>getComputedStyle(el).animationName),'none');
 const rowBox=await active.boundingBox(),ringBox=await ring.boundingBox();assert.ok(ringBox.x+ringBox.width<=rowBox.x+rowBox.width);await page.screenshot({path:resolve(output,'01-running.png')});checks.push('running indicator, animation and long-title layout');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await ring.evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});checks.push('reduced-motion support');
 job.release({events:completed});await hidden();checks.push('completion clears spinner');
 job=await start('等待回复状态测试');const approval={requestId:'input-request',interruptId:'input-interrupt',operationId:'input-operation',expectedCheckpointId:'paused',actions:[{name:'request_form',args:{formKind:'create_target',title:'请选择目标'}}]};
 job.release({events:[{type:'run_started'},{type:'tool_approval_request',payload:approval},{type:'done'}],state:{state:'awaiting_input',checkpointId:'paused',pendingApproval:approval}});await active.getByRole('status',{name:'等待回复',exact:true}).waitFor();assert.equal(await active.getByRole('status',{name:'正在处理',exact:true}).count(),0);await page.screenshot({path:resolve(output,'02-waiting.png')});checks.push('input cards use a static waiting indicator');
 job=await start('手动停止状态测试');await page.getByRole('button',{name:'停止生成',exact:true}).click();await hidden();job.release({events:completed});checks.push('stopping clears spinner');
 job=await start('异常结束状态测试');job.release({status:503});await hidden();checks.push('request failure clears spinner');
 job=await start('切换对话状态测试');await page.getByRole('button',{name:'新对话',exact:true}).click();await page.waitForURL('http://127.0.0.1:3000/dashboard');await page.locator('nav[aria-label="最近对话"]').getByRole('status',{name:'正在处理',exact:true}).waitFor({state:'detached'});job.release({events:completed});checks.push('navigation clears aborted conversation status');
 job=await start('刷新恢复状态测试');await page.reload();await page.locator('textarea').waitFor();assert.equal(await page.locator('nav[aria-label="最近对话"]').getByRole('status',{name:'正在处理',exact:true}).count(),0);job.release({events:completed});checks.push('reload never restores a stuck spinner');
 assert.deepEqual(errors,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});await writeFile(resolve(output,'results.json'),JSON.stringify({passed:false,checks,error:error.message,errors},null,2));console.error(error.message);process.exitCode=1;}finally{pending?.release({events:completed});await browser.close();}
