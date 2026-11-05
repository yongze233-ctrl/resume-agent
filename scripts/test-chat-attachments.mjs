/** Upload failures, retry and first-message attachment handoff in the real UI. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const repo=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(resolve(repo,'apps/agent/package.json')),{chromium}=require('playwright');
const output=resolve(repo,'../evaluation/attachment-upload-fix');await mkdir(output,{recursive:true});
const real=process.env.QA_REAL_MODEL==='1';
const model=real?JSON.parse(execFileSync('python',[process.env.QA_MODEL_CONFIG_READER],{encoding:'utf8',stdio:['ignore','pipe','pipe']})):null;
const browser=await chromium.launch({headless:true});const context=await browser.newContext({locale:'zh-CN',viewport:{width:1450,height:1000}}),page=await context.newPage();page.setDefaultTimeout(25000);
const errors=[],uploadedKeys=[],sessionIds=[],chatRequests=[];let failNext=true,uploadRequests=0,actualModel=false,realRun;
const result={passed:false,realModel:real};
page.on('pageerror',e=>errors.push({name:e.name}));
page.on('response',async response=>{if(response.url().endsWith('/api/backend/api/uploads/attachment')&&response.request().method()==='POST'){const data=await response.json().catch(()=>null);if(data?.data?.key)uploadedKeys.push(data.data.key);}});
await context.route('**/api/local-model-setup',route=>route.fulfill({status:204}));
await context.route('**/api/site-model',route=>route.fulfill({status:200,json:{provider:'opencode-go',model:'deepseek-v4.1-flash',baseUrl:'https://opencode.ai/zen/go/v1',maxTokens:12000}}));
await context.route('**/api/backend/api/uploads/attachment',async route=>{
  uploadRequests++;
  if(failNext){failNext=false;return route.fulfill({status:415,json:{errorCode:'invalid_input',subCode:'document_type_unsupported',retryable:false}});}
  // Continue the original browser upload: CDP's replay body can omit multipart file bytes.
  return route.continue();
});
await context.route('**/api/chat-agent',async route=>{
  const body=route.request().postDataJSON();chatRequests.push({attachments:body.attachments?.length??0});if(body.sessionId)sessionIds.push(body.sessionId);
  if(actualModel){
    const response=await route.fetch({postData:JSON.stringify({...body,config:{source:'byok',...model,maxTokens:12000,effort:'low'}}),timeout:660000}),bytes=await response.body();
    const events=bytes.toString('utf8').split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5)));
    realRun={status:response.status(),tools:events.filter(e=>e.type==='tool_started').map(e=>e.payload?.toolName),answer:events.filter(e=>e.type==='message_chunk').map(e=>e.content??'').join(''),errors:events.filter(e=>e.type==='error').map(e=>e.payload?.subCode??'error')};
    await route.fulfill({response,body:bytes});return;
  }
  const events=[{type:'run_started'},{type:'message_chunk',content:'测试后端已接收附件。'},{type:'done'}];
  await route.fulfill({status:200,contentType:'text/event-stream; charset=utf-8',body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
});
const file=extension=>resolve(repo,`apps/agent/test/fixtures/word-resume.${extension}`);
try{
  await page.goto('http://127.0.0.1:3000/dashboard');await page.locator('textarea').fill('你好，这是我的简历');
  await page.locator('input[type=file]').first().setInputFiles(file('doc'));
  await page.getByText('附件上传失败，请重试或移除失败的附件后再发送。',{exact:true}).waitFor();
  assert.equal(uploadRequests,1,'Strict Mode must not upload a selected file twice');
  assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);
  await page.locator('textarea').press('Enter');await page.waitForTimeout(250);
  assert.equal(chatRequests.length,0);assert.equal(await page.locator('textarea').inputValue(),'你好，这是我的简历');
  await page.getByRole('button',{name:'重试上传 word-resume.doc',exact:true}).waitFor();await page.screenshot({path:resolve(output,'01-failure-preserved.png')});
  result.failedFilesBlockClickAndEnter=true;result.noDuplicateUploads=true;
  await page.getByRole('button',{name:'重试上传 word-resume.doc',exact:true}).click();
  await page.getByText('WORD · 已上传',{exact:true}).waitFor();assert.equal(uploadRequests,2);
  await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForURL(/\/dashboard\/chat\//);
  await page.getByText('测试后端已接收附件。',{exact:true}).waitFor();
  await page.locator('[data-agent-chat]').getByTitle('word-resume.doc',{exact:true}).waitFor();assert.equal(chatRequests[0].attachments,1);
  await page.screenshot({path:resolve(output,'02-filename-in-message.png')});result.retryAndNavigationKeepFile=true;
  await page.goto('http://127.0.0.1:3000/dashboard');failNext=true;await page.locator('textarea').fill('保留这段文字');await page.locator('input[type=file]').first().setInputFiles(file('docx'));
  await page.getByRole('button',{name:'重试上传 word-resume.docx',exact:true}).waitFor();await page.getByRole('button',{name:'移除 word-resume.docx',exact:true}).click();
  assert.equal(await page.locator('textarea').inputValue(),'保留这段文字');assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isEnabled(),true);result.explicitRemovalKeepsDraft=true;
  if(real){
    actualModel=true;await page.goto('http://127.0.0.1:3000/dashboard');await page.locator('textarea').fill('你好，这是我的简历');await page.locator('input[type=file]').first().setInputFiles(file('docx'));await page.getByText('WORD · 已上传',{exact:true}).waitFor();
    await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForURL(/\/dashboard\/chat\//);
    for(let i=0;i<130&&!realRun;i++){await page.waitForTimeout(1000);if(i%25===0)console.log(JSON.stringify({phase:'real-model-reading',elapsedSeconds:i}));}
    assert.ok(realRun,'Real model must finish');assert.equal(realRun.status,200);assert.deepEqual(realRun.errors,[]);assert.ok(realRun.tools.includes('read_attachment'));assert.ok(realRun.answer.includes('陈思远'));assert.ok(!realRun.tools.includes('request_form'),'Sharing a populated resume must not trigger a from-scratch intake');assert.ok(!/空白模板|resume\.json|属于未来时间/.test(realRun.answer),'The reply must describe the real uploaded resume and use the current date');
    await page.getByText('陈思远',{exact:false}).first().waitFor();await page.locator('[data-agent-chat]').getByTitle('word-resume.docx',{exact:true}).waitFor();
    await page.screenshot({path:resolve(output,'03-real-model-knows-resume.png')});await writeFile(resolve(output,'real-model.json'),JSON.stringify(realRun,null,2));result.realModelReadName=true;result.noBlankTemplateClaim=true;
  }
  assert.deepEqual(errors,[]);result.passed=true;console.log(JSON.stringify(result));
}catch(error){result.failure={name:error.name,message:String(error.message).replaceAll(model?.apiKey??'UNUSED_SECRET','[redacted]')};await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});console.error(result.failure.name+': '+result.failure.message);process.exitCode=1;}
finally{await writeFile(resolve(output,'results.json'),JSON.stringify({...result,uploadRequests,chatRequests,errors},null,2));await writeFile(resolve(output,'test-resources.json'),JSON.stringify({uploadedKeys,sessionIds},null,2));await browser.close();}
