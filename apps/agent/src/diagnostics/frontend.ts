import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { currentUserId } from '../auth/context.js';

const frame = z.object({file:z.string().regex(/^\/(?:_next\/static\/|pencil\/assets\/)[A-Za-z0-9_./@%+~-]+\.(?:js|css)$/).max(220),line:z.number().int().min(0).max(10000000),column:z.number().int().min(0).max(10000000)}).strict();
export const frontendEventSchema = z.object({
  version:z.literal(1),eventId:z.string().uuid(),fingerprint:z.string().regex(/^[a-f0-9]{8,64}$/),
  category:z.enum(['javascript','react','resource','operation']),
  component:z.enum(['window','promise','app','dashboard','global','upload','chat','design','export','import','storage','canvas']),
  name:z.enum(['Error','TypeError','RangeError','ReferenceError','SyntaxError','DOMException','NetworkError','ChunkLoadError','Other']),
  code:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  route:z.enum(['home','login','chat','editor','learning','resumes','account','admin','other']),
  build:z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  frames:z.array(frame).max(8),status:z.number().int().min(100).max(599).optional(),
  format:z.enum(['doc','docx','pdf','image','json','other']).optional(),
}).strict();

/** No arbitrary message, URL, browser header or document field is accepted. */
export function frontendDiagnostics(app:FastifyInstance,db:Database.Database,authRequired=false) {
  db.exec(`CREATE TABLE IF NOT EXISTS frontend_errors (
    event_id TEXT PRIMARY KEY, user_ref TEXT NOT NULL, fingerprint TEXT NOT NULL,
    category TEXT NOT NULL, component TEXT NOT NULL, code TEXT NOT NULL,
    route TEXT NOT NULL, build TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS frontend_errors_time ON frontend_errors(created_at);`);
  app.post('/api/diagnostics/frontend',{bodyLimit:8192,config:{rateLimit:{max:60,timeWindow:'1 minute'}}},async(request,reply)=>{
    reply.header('Cache-Control','no-store, private');
    const parsed=frontendEventSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({errorCode:'invalid_input',subCode:'diagnostic_payload_invalid'});
    const event=parsed.data,now=Date.now();
    if(authRequired&&!currentUserId()&&event.route!=='login')return reply.code(401).send({errorCode:'unauthenticated',subCode:'user_session_required'});
    // Bound both retention and total disk use, even for a noisy browser.
    db.prepare('DELETE FROM frontend_errors WHERE created_at < ?').run(now-14*86400000);
    const userRef=createHash('sha256').update(currentUserId()??'local').digest('hex').slice(0,16);
    const recorded=db.prepare('INSERT OR IGNORE INTO frontend_errors VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(event.eventId,userRef,event.fingerprint,event.category,event.component,event.code,event.route,event.build,JSON.stringify(event),now);
    db.exec('DELETE FROM frontend_errors WHERE rowid NOT IN (SELECT rowid FROM frontend_errors ORDER BY created_at DESC LIMIT 10000)');
    if(recorded.changes)request.log.warn({eventId:event.eventId,fingerprint:event.fingerprint,category:event.category,component:event.component,code:event.code,route:event.route,build:event.build},'Frontend error reported');
    return reply.code(202).send({accepted:true,eventId:event.eventId});
  });
}
