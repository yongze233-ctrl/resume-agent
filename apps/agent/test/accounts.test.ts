import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fixture } from './helpers.js';

const password = 'Test-only-account-2026!';
const originHeader = { origin: 'http://localhost:3000' };
function cookies(headers: Record<string, unknown>) {
  const values = headers['set-cookie'];
  return (Array.isArray(values) ? values : [values]).filter((v): v is string => typeof v === 'string').map((value) => value.split(';')[0]).join('; ');
}

test('administrator-managed accounts isolate files and sessions even at the same client address', async (t) => {
  const env = { AGENT_AUTH_REQUIRED:'true', AUTH_PUBLIC_ORIGIN:'http://localhost:3000', BETTER_AUTH_SECRET:'a-secure-test-only-secret-with-more-than-32-characters', AUTH_BOOTSTRAP_USERNAME:'admin', AUTH_BOOTSTRAP_PASSWORD:password };
  const { app, origin, body, fake } = await fixture(t,'sqlite',[],env);
  const anonymous = await app.inject({method:'GET',url:'/api/chat/session?sessionId=private-session'});
  assert.equal(anonymous.statusCode,401);
  const diagnostic={version:1,eventId:crypto.randomUUID(),fingerprint:'b'.repeat(64),category:'javascript',component:'window',name:'TypeError',code:'uncaught_error',route:'login',build:'test',frames:[]};
  assert.equal((await app.inject({method:'POST',url:'/api/diagnostics/frontend',headers:originHeader,payload:diagnostic})).statusCode,202,'Anonymous login-page failures have a bounded diagnostics path');
  assert.equal((await app.inject({method:'POST',url:'/api/diagnostics/frontend',headers:originHeader,payload:{...diagnostic,route:'chat'}})).statusCode,401,'Anonymous diagnostics cannot claim an authenticated workspace');
  const signup = await app.inject({method:'POST',url:'/api/auth/sign-up/email',headers:originHeader,payload:{email:'new@example.com',password,name:'New'}});
  assert.equal(signup.statusCode,404,'Public registration is not exposed');
  const login = await app.inject({method:'POST',url:'/api/auth/sign-in/username',headers:originHeader,payload:{username:'admin',password}});
  assert.equal(login.statusCode,200,login.body);
  assert.equal(login.json().token,undefined,'Session credentials stay in cookies');
  assert.match(String(login.headers['set-cookie']),/HttpOnly/i);
  const adminCookie = cookies(login.headers);
  const created = await app.inject({method:'POST',url:'/api/auth/admin/create-user',headers:{...originHeader,cookie:adminCookie},payload:{name:'Tester',password,data:{username:'tester-b'},role:'admin'}});
  assert.equal(created.statusCode,200,created.body);
  assert.equal(created.json().user.role,'user','The public management API cannot create another administrator');
  assert.doesNotMatch(String(created.headers['set-cookie']),/resume_user_id=/,'Creating another user never changes the administrator local-storage identity');
  const userId = created.json().user.id;
  const loginB = await app.inject({method:'POST',url:'/api/auth/sign-in/username',headers:originHeader,payload:{username:'tester-b',password}});
  assert.equal(loginB.statusCode,200,loginB.body);
  const userCookie = cookies(loginB.headers);
  const forbidden = await app.inject({method:'GET',url:'/api/auth/admin/list-users',headers:{cookie:userCookie}});
  assert.equal(forbidden.statusCode,403);
  const protectedAdmin = await app.inject({method:'POST',url:'/api/auth/admin/ban-user',headers:{...originHeader,cookie:adminCookie},payload:{userId:login.json().user.id}});
  assert.equal(protectedAdmin.statusCode,400);

  const form = new FormData();
  form.set('file',new File([await readFile(new URL('./fixtures/resume.png',import.meta.url))],'my-resume.png',{type:'image/png'}));
  const upload = await fetch(`${origin}/api/uploads/attachment`,{method:'POST',headers:{...originHeader,cookie:adminCookie},body:form});
  assert.equal(upload.status,200);
  const key = (await upload.json() as {data:{key:string}}).data.key;
  const readUrl = await app.inject({method:'POST',url:'/api/uploads/attachment/read-url',headers:{...originHeader,cookie:adminCookie},payload:{key}});
  assert.equal(readUrl.statusCode,200,readUrl.body);
  const foreignUrl = await app.inject({method:'POST',url:'/api/uploads/attachment/read-url',headers:{...originHeader,cookie:userCookie},payload:{key}});
  assert.equal(foreignUrl.statusCode,404,'A guessed upload key cannot cross accounts');
  const signed = new URL(readUrl.json().data.url);
  const foreignFile = await app.inject({method:'GET',url:signed.pathname+signed.search,headers:{cookie:userCookie}});
  assert.equal(foreignFile.statusCode,404,'A copied signed URL is also bound to the logged-in file owner');

  const chat = await app.inject({method:'POST',url:'/api/chat',headers:{...originHeader,cookie:adminCookie},payload:body({sessionId:'private-admin-session',resumeId:'private-admin-resume',messages:[{role:'user',content:'Hello'}],agentMode:'ask',currentResume:undefined})});
  assert.equal(chat.statusCode,200,chat.body);
  const before = fake.requests.length;
  const foreignState = await app.inject({method:'GET',url:'/api/chat/session?sessionId=private-admin-session',headers:{cookie:userCookie,'x-user-id':login.json().user.id}});
  assert.equal(foreignState.statusCode,404,'User-ID headers cannot impersonate the session owner');
  const foreignChat = await app.inject({method:'POST',url:'/api/chat',headers:{...originHeader,cookie:userCookie},payload:body({sessionId:'private-admin-session'})});
  assert.equal(foreignChat.statusCode,404);
  assert.equal(fake.requests.length,before,'A foreign session is rejected before model execution');
  const impersonation = await app.inject({method:'POST',url:'/api/auth/admin/impersonate-user',headers:{...originHeader,cookie:adminCookie},payload:{userId}});
  assert.equal(impersonation.statusCode,404,'Unrequested impersonation endpoints are not exposed');
  const banned = await app.inject({method:'POST',url:'/api/auth/admin/ban-user',headers:{...originHeader,cookie:adminCookie},payload:{userId}});
  assert.equal(banned.statusCode,200,banned.body);
  assert.equal((await app.inject({method:'GET',url:'/api/chat/session?sessionId=any',headers:{cookie:userCookie}})).statusCode,401,'Disabling a user revokes existing access');
  const unbanned = await app.inject({method:'POST',url:'/api/auth/admin/unban-user',headers:{...originHeader,cookie:adminCookie},payload:{userId}});
  assert.equal(unbanned.statusCode,200);
  const loginAgain = await app.inject({method:'POST',url:'/api/auth/sign-in/username',headers:originHeader,payload:{username:'tester-b',password}});
  assert.equal(loginAgain.statusCode,200);
  const newPassword = 'Another-test-password-2026!';
  const reset = await app.inject({method:'POST',url:'/api/auth/admin/set-user-password',headers:{...originHeader,cookie:adminCookie},payload:{userId,newPassword}});
  assert.equal(reset.statusCode,200,reset.body);
  assert.equal((await app.inject({method:'GET',url:'/api/chat/session?sessionId=any',headers:{cookie:cookies(loginAgain.headers)}})).statusCode,401,'Resetting the password revokes previously issued sessions');
  assert.equal((await app.inject({method:'POST',url:'/api/auth/sign-in/username',headers:originHeader,payload:{username:'tester-b',password}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/sign-in/username',headers:originHeader,payload:{username:'tester-b',password:newPassword}})).statusCode,200);
});
