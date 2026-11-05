import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPencilSession, nextCanvasJob, pencilProps, resolveCanvasJob } from '../design/openpencil-session.js';

export function openPencilRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/openpencil/:id', { config: { rateLimit: false } }, async (request, reply) => {
    const session = getPencilSession(request.params.id);
    if (!session) return reply.code(404).send({ error: 'design_not_found' });
    return reply.header('Cache-Control', 'no-store, private').send({ ...pencilProps(session), job: nextCanvasJob(session) });
  });
  app.post<{ Params: { id: string; jobId: string } }>('/api/openpencil/:id/jobs/:jobId', { bodyLimit: 24 * 1024 * 1024 }, async (request, reply) => {
    const session = getPencilSession(request.params.id);
    if (!session) return reply.code(404).send({ error: 'design_not_found' });
    const parsed = z.object({ ok: z.boolean(), result: z.unknown().optional(), error: z.string().max(1000).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_result' });
    resolveCanvasJob(session, request.params.jobId, parsed.data);
    return reply.header('Cache-Control', 'no-store').send({ ok: true });
  });
  app.get<{ Params: { id: string; kind: string } }>('/api/openpencil/:id/artifacts/:kind', async (request, reply) => {
    const session = getPencilSession(request.params.id);
    const kind = request.params.kind;
    const value = session?.bundle?.[kind];
    if (!session || !['pdf', 'fig'].includes(kind) || typeof value !== 'string') return reply.code(404).send({ error: 'artifact_not_found' });
    return reply.header('Cache-Control', 'no-store, private').type(kind === 'pdf' ? 'application/pdf' : 'application/octet-stream').send(Buffer.from(value, 'base64'));
  });
}
