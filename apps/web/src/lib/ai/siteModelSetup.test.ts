import assert from 'node:assert/strict';
import {test} from 'node:test';
import {useSettingStore} from '@/store/useSettingStore';
import {loadSiteModel} from './siteModelSetup';
import {MemoryDb} from '../../../scripts/test-memory-db';
import {dbClient} from '@/lib/api/IndexDBClient';
import {isProtectedApiKey} from '@/lib/security/byokVault';
import {resolveAiAccessConfig} from '@/app/dashboard/edit/_components/ai/lib/services/aiAccess';

test('a cold-page import can await the existing site-model request instead of seeing missing configuration',async(t)=>{
  const original=useSettingStore.getState();t.after(()=>useSettingStore.setState(original,true));
  useSettingStore.setState({apiKey:'',siteModel:null});
  let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
  const fetch=t.mock.method(globalThis,'fetch',async()=>{await gate;return Response.json({provider:'opencode-go',model:'deepseek-v4.1-flash',baseUrl:'https://opencode.ai/zen/go/v1',maxTokens:12000});});
  const bootstrap=loadSiteModel(),importReady=loadSiteModel();
  assert.equal(bootstrap,importReady);assert.equal(fetch.mock.callCount(),1);assert.equal(useSettingStore.getState().hasLlmConfig(),false);
  finish();await importReady;
  assert.equal(useSettingStore.getState().hasLlmConfig(),true);assert.equal(useSettingStore.getState().apiKey,'');
});

test('an absent default finishes cleanly so explicit BYOK setup can still be requested',async(t)=>{
  const original=useSettingStore.getState();t.after(()=>useSettingStore.setState(original,true));
  useSettingStore.setState({apiKey:'',siteModel:null});t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
  await loadSiteModel();assert.equal(useSettingStore.getState().siteModel,null);assert.equal(useSettingStore.getState().hasLlmConfig(),false);
});

test('an explicit local default switches once, preserves the encrypted personal key and respects later choices',async(t)=>{
  const original=useSettingStore.getState();t.after(()=>useSettingStore.setState(original,true));
  const db=new MemoryDb();t.mock.method(dbClient,'getItem',db.getItem.bind(db));t.mock.method(dbClient,'setItem',db.setItem.bind(db));
  useSettingStore.setState({provider:'opencode-go',apiKey:'old-personal-key',model:'deepseek-v4.1-flash',baseUrl:'https://opencode.ai/zen/go/v1',maxTokens:12000,siteModel:null,preferSiteModel:false});
  await useSettingStore.getState().saveSettings();
  t.mock.method(globalThis,'fetch',async()=>Response.json({provider:'agnes-token-plan',baseUrl:'https://apihub.agnes-ai.com/v1',model:'agnes-3.0-flash',maxTokens:16384,setupId:'agnes-local-setup'}));
  await loadSiteModel();
  assert.equal(useSettingStore.getState().preferSiteModel,true);
  assert.equal(useSettingStore.getState().apiKey,'old-personal-key');
  const selected=resolveAiAccessConfig();assert.ok(selected.ok);assert.equal(selected.config.source,'server');assert.equal(selected.config.modelName,'agnes-3.0-flash');assert.ok(!('apiKey' in selected.config));
  const saved=await db.getItem<Record<string,unknown>>('settings');assert.ok(isProtectedApiKey(saved?.apiKey));assert.equal(saved?.preferSiteModel,true);
  useSettingStore.getState().setProvider('opencode-go');await useSettingStore.getState().saveSettings();await loadSiteModel();
  assert.equal(useSettingStore.getState().preferSiteModel,false);
  const personal=resolveAiAccessConfig();assert.ok(personal.ok);assert.equal(personal.config.source,'byok');assert.equal(personal.config.modelName,'deepseek-v4.1-flash');
});
