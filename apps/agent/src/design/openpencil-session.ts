import { randomUUID } from 'node:crypto';
import { assertOwned, currentUserId } from '../auth/context.js';
import { sourceHash, type DesignStep } from './artifacts.js';
import { AgentError } from '../contracts/errors.js';
import type { CanvasComments } from './canvas-comments.js';

export interface PencilContext { sessionId: string; sourceHash: string; frameId?: string; frameIds?: string[]; rationale?: string; portraitImageHash?: string; comments?: CanvasComments; }

export interface CanvasJob { id: string; operation: string; command?: string; args?: Record<string, unknown>; frameId?: string; }
interface PendingJob { job: CanvasJob; resolve: (value: unknown) => void; reject: (error: Error) => void; }
export interface PencilSession {
  ownerId?: string;
  id: string; sourceHash: string; rationale: string; createdAt: number;
  status: 'working' | 'ready' | 'failed'; steps: DesignStep[];
  frameId?: string; review?: string; bundle?: Record<string, unknown>;
  portraitImageHash?: string;
  portraitStatus?: 'available' | 'none' | 'ambiguous' | 'unavailable';
  frameIds?: string[];
  jobs: Map<string, PendingJob>;
}
const sessions = new Map<string, PencilSession>();
export function createPencilSession(resume: Record<string, unknown>, rationale: string, id: string = randomUUID()): PencilSession {
  assertOwned('pencil',id,true);
  for (const [id, session] of sessions) if (Date.now() - session.createdAt > 3_600_000) {
    for (const pending of session.jobs.values()) pending.reject(new Error('设计会话已过期'));
    sessions.delete(id);
  }
  if (sessions.size >= 40) throw new Error('设计会话过多，请稍后重试');
  const session: PencilSession = { id, ownerId: currentUserId(), sourceHash: sourceHash(resume), rationale, createdAt: Date.now(), status: 'working', steps: [], jobs: new Map() };
  sessions.set(session.id, session);
  return session;
}
export function resumePencilSession(resume: Record<string, unknown>, context: PencilContext): PencilSession {
  const hash = sourceHash(resume);
  const existing = getPencilSession(context.sessionId);
  if (hash !== context.sourceHash || (existing && existing.sourceHash !== hash)) {
    throw new AgentError(409, 'invalid_input', 'design_source_changed');
  }
  if (existing) return existing;
  const restored = createPencilSession(resume, context.rationale ?? '继续编辑当前简历设计', context.sessionId);
  restored.frameId = context.frameId;
  restored.portraitImageHash = context.portraitImageHash;
  restored.frameIds = context.frameIds;
  return restored;
}
export function getPencilSession(id: string) {
  assertOwned('pencil',id,false,true);
  const session = sessions.get(id);
  return session && session.ownerId === currentUserId() && Date.now() - session.createdAt <= 3_600_000 ? session : undefined;
}
export function pencilProps(session: PencilSession) {
  return { engine: 'openpencil', sessionId: session.id, sourceHash: session.sourceHash, rationale: session.rationale, status: session.status, steps: session.steps.map((step) => ({ ...step })), frameId: session.frameId, frameIds: session.frameIds, review: session.review, portraitImageHash: session.portraitImageHash };
}
export function requestCanvas(session: PencilSession, input: Omit<CanvasJob, 'id'>, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const job = { ...input, id: randomUUID() };
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: unknown) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      session.jobs.delete(job.id);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(new Error('设计已停止'));
    const timeout = setTimeout(() => finish(new AgentError(503, 'upstream_unavailable', 'design_canvas_unavailable')), 70_000);
    signal.addEventListener('abort', abort, { once: true });
    session.jobs.set(job.id, { job, resolve: (value) => finish(undefined, value), reject: (error) => finish(error) });
  });
}
export function nextCanvasJob(session: PencilSession): CanvasJob | null {
  return session.jobs.values().next().value?.job ?? null;
}
export function resolveCanvasJob(session: PencilSession, id: string, result: { ok: boolean; result?: unknown; error?: string }) {
  const pending = session.jobs.get(id);
  if (!pending) return false;
  if (result.ok) pending.resolve(result.result);
  else pending.reject(new Error(result.error?.slice(0, 300) || 'OpenPencil 执行失败'));
  return true;
}
