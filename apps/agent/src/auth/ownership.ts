import type Database from 'better-sqlite3';
import { AgentError } from '../contracts/errors.js';
import type { ResourceKind } from './context.js';

export class Ownership {
  constructor(private readonly db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS resource_owners (
      kind TEXT NOT NULL, resource_id TEXT NOT NULL, user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY(kind, resource_id)
    ); CREATE INDEX IF NOT EXISTS resource_owner_user ON resource_owners(user_id);`);
    // Existing anonymous checkpoints have no trustworthy account attribution.
    // Reserve them instead of letting the first account to guess an ID claim them.
    db.prepare(`INSERT OR IGNORE INTO resource_owners(kind,resource_id,user_id,created_at)
      SELECT 'session', session_id, '__legacy__', ? FROM turns`).run(Date.now());
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='checkpoints'").get()) {
      db.prepare(`INSERT OR IGNORE INTO resource_owners(kind,resource_id,user_id,created_at)
        SELECT 'session', thread_id, '__legacy__', ? FROM checkpoints`).run(Date.now());
    }
  }
  assert(userId: string, kind: ResourceKind, id: string, claim: boolean, allowMissing: boolean) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new AgentError(400, 'invalid_input', 'resource_id_invalid');
    if (claim) this.db.prepare('INSERT OR IGNORE INTO resource_owners VALUES (?,?,?,?)').run(kind, id, userId, Date.now());
    const owner = this.db.prepare('SELECT user_id FROM resource_owners WHERE kind=? AND resource_id=?').get(kind,id) as { user_id: string } | undefined;
    if (owner ? owner.user_id !== userId : !allowMissing) {
      throw new AgentError(404, 'not_found', 'resource_not_found');
    }
  }
}
