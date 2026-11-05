import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyRequest } from 'fastify';
import { Ownership } from '../src/auth/ownership.js';
import { AccountService } from '../src/auth/service.js';
import { identityContext, type SiteUser } from '../src/auth/context.js';
import { readSettings } from '../src/config.js';
import { createPencilSession, getPencilSession, resumePencilSession } from '../src/design/openpencil-session.js';
import { getDesign, putDesign } from '../src/design/artifacts.js';
import { buildDesignTemplate, designSpecSchema } from '../src/design/template.js';

test('legacy sessions, design restores and internal render capabilities preserve account boundaries', async () => {
  const dir = await mkdtemp(join(tmpdir(),'resume-ownership-'));
  const db = new Database(':memory:');
  db.exec("CREATE TABLE turns(session_id TEXT); INSERT INTO turns VALUES ('old-anonymous'); CREATE TABLE checkpoints(thread_id TEXT); INSERT INTO checkpoints VALUES ('old-checkpoint');");
  const owners = new Ownership(db);
  const settings = readSettings({AGENT_DATA_DIR:dir,AGENT_AUTH_REQUIRED:'true',BETTER_AUTH_SECRET:'a-test-only-secret-with-more-than-32-characters'});
  const accounts = new AccountService(settings,owners);
  const a:SiteUser={id:'account-a',username:'a',name:'A',role:'user',disabled:false,createdAt:''};
  const b:SiteUser={...a,id:'account-b',username:'b',name:'B'};
  try {
    for(const id of ['old-anonymous','old-checkpoint']) assert.throws(()=>owners.assert(a.id,'session',id,true,true));
    const canvas=identityContext.run(accounts.context(a),()=>createPencilSession({},'Owned canvas'));
    assert.throws(()=>identityContext.run(accounts.context(b),()=>getPencilSession(canvas.id)));
    assert.throws(()=>identityContext.run(accounts.context(b),()=>resumePencilSession({},{sessionId:canvas.id,sourceHash:canvas.sourceHash})));
    const artifact=identityContext.run(accounts.context(a),()=>putDesign({},buildDesignTemplate(designSpecSchema.parse({direction:'project-cover',featureProjectId:'test',rationale:'A valid test-only design rationale.',decisions:[{zone:'identity',reason:'Use a clear name.'},{zone:'projects',reason:'Show a main project.'},{zone:'support',reason:'Group supporting facts.'}]}))));
    assert.throws(()=>identityContext.run(accounts.context(b),()=>getDesign(artifact.id)));
    assert.throws(()=>accounts.context(b).renderTicket(artifact.id));
    const token=accounts.context(a).renderTicket(artifact.id);
    const probe=(method:string,url:string)=>accounts.renderUser({method,url,headers:{'x-resume-render-token':token}} as unknown as FastifyRequest);
    assert.equal(probe('GET',`/api/design-artifacts/${artifact.id}`)?.id,a.id);
    assert.equal(probe('GET','/api/design-artifacts/another-artifact'),null);
    assert.equal(probe('GET',`/api/openpencil/${canvas.id}`),null);
    assert.equal(probe('POST',`/api/design-artifacts/${artifact.id}`),null);
  } finally { accounts.close(); db.close(); await rm(dir,{recursive:true,force:true}); }
});
