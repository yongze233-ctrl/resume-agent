import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {join} from 'node:path';
import {fixture} from './helpers.js';

const event=()=>({version:1,eventId:randomUUID(),fingerprint:'a'.repeat(64),category:'javascript',component:'window',name:'TypeError',code:'uncaught_error',route:'chat',build:'test-release',frames:[{file:'/_next/static/chunks/test.js',line:1,column:22}]});
test('diagnostics reject raw document/credential fields, deduplicate and persist only allowed code locations',async(t)=>{
  const f=await fixture(t);const input=event();
  assert.equal((await f.post('/api/diagnostics/frontend',{...input,message:'PRIVATE_RESUME_EMAIL_AND_KEY'})).status,400);
  assert.equal((await f.post('/api/diagnostics/frontend',{...input,frames:[{file:'/dashboard/chat/private-resume?token=SECRET',line:1,column:1}]})).status,400);
  assert.equal((await f.post('/api/diagnostics/frontend',input)).status,202);
  assert.equal((await f.post('/api/diagnostics/frontend',input)).status,202);
  const db=new Database(join(f.dataDir,'checkpoints.sqlite'),{readonly:true});
  const rows=db.prepare('SELECT * FROM frontend_errors').all();db.close();
  assert.equal(rows.length,1);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_RESUME|SECRET|password|apiKey|message|cookie/i);
});
