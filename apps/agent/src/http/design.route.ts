import type { FastifyInstance } from 'fastify';
import { getDesign } from '../design/artifacts.js';

export function designRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/design-artifacts/:id', async (request, reply) => {
    const id = request.params.id;
    if (!/^[a-f0-9-]{36}$/.test(id)) return reply.code(404).send({ error: 'not_found' });
    const artifact = getDesign(id);
    if (!artifact || Date.now() - artifact.createdAt > 3_600_000) return reply.code(404).send({ error: 'not_found' });
    return reply.header('Cache-Control', 'no-store, private').send({ resume: artifact.resume, template: artifact.template });
  });
}
