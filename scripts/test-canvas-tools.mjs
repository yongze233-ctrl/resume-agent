/** Real native canvas/transport regression. Uses only synthetic text and image fixtures. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pencilVisualScript} from '../apps/agent/src/design/pencil-visual.ts';
const repo=resolve(import.meta.dirname,'..'),require=createRequire(resolve(repo,'apps/agent/package.json'));
const {chromium}=require('playwright'),{PDFParse}=require('pdf-parse');
const output=resolve(process.env.QA_OUTPUT_DIR??resolve(repo,'../evaluation/full-regression-20261105/native-tools'));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.QA_PROXY?{proxy:{server:process.env.QA_PROXY}}:{})}),context=await browser.newContext({viewport:{width:1450,height:1000}}),page=await context.newPage();
const channel=randomUUID(),checks=[],pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
const canvasUrl=process.env.QA_CANVAS_URL??'http://127.0.0.1:1420',origin=new URL(canvasUrl).origin,base=process.env.QA_WEB_URL??'http://127.0.0.1:3000';
async function rpc(operation,args={}){return page.evaluate(({operation,args})=>window.canvasRpc(operation,args),{operation,args});}
async function edit(code,extra={}){const result=await rpc('call',{command:'eval',args:{code:pencilVisualScript({},code)},...extra});assert.equal(result.ok,true,result.error);return result.result;}
try{
 if(process.env.QA_LOGIN_PASSWORD){const login=await context.request.post(base+'/api/auth/sign-in/username',{headers:{Origin:base},data:{username:process.env.QA_LOGIN_USERNAME,password:process.env.QA_LOGIN_PASSWORD}});assert.equal(login.status(),200,'QA account sign-in');}
 await page.goto(base+'/robots.txt');await page.setContent('<iframe style="border:0;width:100vw;height:100vh"></iframe>');
 await page.evaluate(({origin,canvasUrl,channel})=>{
  const pending=new Map();window.canvasReady=false;
  window.addEventListener('message',e=>{if(e.origin!==origin||e.data?.channel!==channel)return;if(e.data.type==='magic-resume:ready')window.canvasReady=true;
   if(e.data.type==='magic-resume:result'){const p=pending.get(e.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.data.id);e.data.ok?p.resolve(e.data.result):p.reject(new Error(e.data.error));}});
  window.canvasRpc=(operation,args={})=>new Promise((resolve,reject)=>{const id=args.id??crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('canvas_timeout'));},15000);pending.set(id,{resolve,reject,timer});document.querySelector('iframe').contentWindow.postMessage({type:'magic-resume:request',channel,id,operation,...args},origin);});
  document.querySelector('iframe').src=canvasUrl.replace(/\/$/,'')+'/?magic_resume='+channel;
 },{origin,canvasUrl,channel});
 await page.waitForFunction(()=>window.canvasReady,null,{timeout:60000});
 let pixels;
 if(process.env.QA_CANVAS_IMAGE_FILE){
  pixels=(await readFile(resolve(process.env.QA_CANVAS_IMAGE_FILE))).toString('base64');
 }else{
 const upload=await context.request.post(base+'/api/backend/api/uploads/attachment',{multipart:{file:{name:'synthetic-photo.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await readFile(resolve(repo,'apps/agent/test/fixtures/word-resume-with-photo.docx'))}}});
 assert.equal(upload.status(),200);const key=(await upload.json()).data.key;
 const portraitResponse=await context.request.post(base+'/api/backend/api/uploads/attachment/portrait',{data:{key}});
 assert.equal(portraitResponse.status(),200);const portrait=(await portraitResponse.json()).data.candidates[0];
 assert.ok(portrait);await writeFile(resolve(output,'test-resource.json'),JSON.stringify({attachmentKey:key}));
 pixels=portrait.dataUrl.split(',')[1];
 }
 const ids=await edit(`const frame=figma.createFrame();frame.name='Synthetic A4';frame.resize(595.28,841.89);frame.fills=[{type:'SOLID',color:visual.rgb('#ffffff')}];
 const title=visual.text(frame,'陈思远 · Chen Siyuan',{x:28,y:28,width:420,size:24,bold:true,color:'#223344'});
 const body=visual.stack(frame,[{text:'AI 产品经理 / Product Manager'},{text:'负责企业知识助手；评测从 72% 提升至 86%。'}],{x:28,y:85,width:420,size:11,gap:10});
 const rect=visual.box(frame,{x:28,y:145,width:420,height:2,color:'#446688'});
 const hash=figma.createImage(figma.base64Decode(${JSON.stringify(pixels)})).hash;
 const photo=visual.photo(frame,hash,{x:470,y:28,width:90,height:126});
 figma.viewport.scrollAndZoomIntoView([frame]);return {frame:frame.id,title:title.id,body:body.nodes.map(n=>n.id),rect:rect.id,photo:photo.id};`);
 checks.push('create A4 frame, mixed-language typography, stack, shape and '+(process.env.QA_CANVAS_IMAGE_FILE?'supplied synthetic image (upload/photo extraction not exercised)':'original DOCX photo'));
 const mutation=await edit(`const title=figma.getNodeById(${JSON.stringify(ids.title)});title.characters='陈思远 · AI 产品经理';title.fontSize=26;title.fills=[{type:'SOLID',color:visual.rgb('#5B3F8C')}];title.x=32;
 const rect=figma.getNodeById(${JSON.stringify(ids.rect)});rect.resize(400,3);const copy=rect.clone();copy.y=200;const group=figma.group([copy],figma.getNodeById(${JSON.stringify(ids.frame)}));const groupId=group.id;group.remove();return {text:title.characters,size:title.fontSize,x:title.x,width:rect.width,removed:figma.getNodeById(groupId)===null};`);
 assert.equal(mutation.size,26);assert.equal(mutation.x,32);assert.equal(mutation.width,400);assert.equal(mutation.removed,true);
 checks.push('edit text/font/color/position, resize, clone, group and delete');
 await rpc('call',{command:'undo'});assert.equal((await edit(`return figma.getNodeById(${JSON.stringify(ids.title)}).characters;`)),'陈思远 · Chen Siyuan');
 await rpc('call',{command:'redo'});assert.equal((await edit(`return figma.getNodeById(${JSON.stringify(ids.title)}).fontSize;`)),26);
 checks.push('undo and redo restore the complete native edit');
 const auto=await edit(`const root=figma.getNodeById(${JSON.stringify(ids.frame)});const group=figma.createFrame();root.appendChild(group);group.name='Auto layout';group.layoutMode='VERTICAL';group.itemSpacing=10;group.resize(400,160);group.x=28;group.y=220;
 const a=visual.text(group,'自动布局一',{x:0,y:0,width:380,size:11});const b=visual.text(group,'自动布局二',{x:0,y:0,width:380,size:11});return {group:group.id,first:a.id,second:b.id};`);
 const layout=await edit(`const a=figma.getNodeById(${JSON.stringify(auto.first)}),b=figma.getNodeById(${JSON.stringify(auto.second)});return {aBottom:a.y+a.height,bY:b.y};`);
 assert.ok(layout.bY>=layout.aBottom+9.9);checks.push('native vertical auto-layout measures and separates text nodes');
 const badId=randomUUID(),started=Date.now();
 const badCode=`const root=figma.getNodeById(${JSON.stringify(ids.frame)});root.setPluginData('qa-count',String(Number(root.getPluginData('qa-count')||0)+1));return async()=>{};`;
 for(let i=0;i<2;i++)await assert.rejects(()=>edit(badCode,{id:badId}),/画布操作结果无法传输/);
 assert.ok(Date.now()-started<12000,'uncloneable return must promptly settle instead of a 60s timeout');
 assert.equal((await edit(`return figma.getNodeById(${JSON.stringify(ids.frame)}).getPluginData('qa-count');`)),'1');
 checks.push('uncloneable function results return a repairable error; retried request IDs settle without replay');
 await assert.rejects(()=>rpc('call',{command:'eval',args:{code:'throw new Error("synthetic edit failure")'}}),/synthetic edit failure/);
 await assert.rejects(()=>rpc('bundle',{frameId:'deleted-frame'}),/未定位到唯一/);
 checks.push('a stale explicit export target is rejected, never replaced with another resume');
 const bundle=await rpc('bundle',{frameId:ids.frame,args:{frameIds:[ids.frame]}});assert.equal(bundle.pages.length,1);assert.ok(bundle.fig.length>500);
 const pdf=Buffer.from(bundle.pdf,'base64');await writeFile(resolve(output,'native.pdf'),pdf);await writeFile(resolve(output,'native.fig'),Buffer.from(bundle.fig,'base64'));
 const parser=new PDFParse({data:pdf,verbosity:0});try{const text=(await parser.getText()).text;assert.ok(text.includes('陈思远'));assert.ok(text.includes('86%'));const shots=await parser.getScreenshot({scale:1.5});await writeFile(resolve(output,'native.png'),shots.pages[0].data);}finally{await parser.destroy();}
 assert.ok(pdf.toString('latin1').includes('/Subtype /Image'));checks.push('PDF export contains one page, embedded image and extractable Chinese/English text');
 await edit(`figma.getNodeById(${JSON.stringify(ids.frame)}).remove();return true;`);await rpc('restore',{fig:bundle.fig,frameId:ids.frame});
 const inspection=await rpc('inspect',{frameId:ids.frame});assert.ok(inspection.nodes.some(n=>n.text==='陈思远 · AI 产品经理'));
 await edit(`figma.getNodeById(${JSON.stringify(ids.title)}).characters='陈思远 · restored editable';return true;`);
 assert.ok((await rpc('inspect',{frameId:ids.frame})).nodes.some(n=>n.text?.includes('restored editable')));checks.push('FIG round-trip preserves layout and remains editable');
 assert.deepEqual(pageErrors,[]);await page.screenshot({path:resolve(output,'workspace.png')});
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,checks,pageErrors},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){await writeFile(resolve(output,'result.json'),JSON.stringify({passed:false,checks,pageErrors,error:e.message},null,2));throw e;}finally{if(process.env.QA_LOGIN_PASSWORD)await context.request.post(base+'/api/auth/sign-out',{headers:{Origin:base},data:{}}).catch(()=>{});await browser.close();}
