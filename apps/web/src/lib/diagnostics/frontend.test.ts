import assert from 'node:assert/strict';
import test from 'node:test';
import {makeFrontendDiagnostic,diagnosticRoute} from './frontend';

test('frontend reports exclude messages, query tokens, private paths and cross-origin frames',async()=>{
  const error=new TypeError('PRIVATE_RESUME chen@example.com oc_sk_PRIVATE password=PRIVATE');
  error.stack='TypeError: PRIVATE_RESUME\n at render (https://cv.yongze.win/_next/static/chunks/app.js?token=PRIVATE:1:223)\n at https://other.example/x.js:1:3\n at https://cv.yongze.win/dashboard/chat/private-id:1:9';
  const report=await makeFrontendDiagnostic({error,component:'window'},{origin:'https://cv.yongze.win',path:'/dashboard/chat/private-id?token=PRIVATE',build:'test'});
  assert.equal(report?.route,'chat');assert.deepEqual(report?.frames,[{file:'/_next/static/chunks/app.js',line:1,column:223}]);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE|chen@|oc_sk_|password|private-id|other.example|token=/);
  assert.equal(diagnosticRoute('/dashboard/admin/users'),'admin');
});
test('expected aborts do not become frontend failures',async()=>{
  assert.equal(await makeFrontendDiagnostic({error:new DOMException('Stopped','AbortError'),component:'chat'},{origin:'https://cv.yongze.win',path:'/dashboard',build:'test'}),null);
});
