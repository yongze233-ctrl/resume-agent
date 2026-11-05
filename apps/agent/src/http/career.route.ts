import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findJobs, findJob } from '../career/jobs.js';
const querySchema = z.object({
  q: z.string().trim().min(1).max(300).default('AI 产品经理 Agent RAG'),
});
export function careerRoutes(app: FastifyInstance) {
  app.get('/api/resources/job', async (request, reply) => {
    const parsed = z
      .object({ url: z.string().url().max(2000) })
      .safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ status: 'invalid' });
    const controller = new AbortController();
    request.raw.once('aborted', () => controller.abort());
    const result = await findJob(parsed.data.url, controller.signal);
    return reply
      .header('Cache-Control', 'no-store')
      .code(
        result.status === 'invalid'
          ? 400
          : result.status === 'not_found'
            ? 404
            : result.status === 'unavailable'
              ? 503
              : 200,
      )
      .send(result);
  });
  app.get('/api/resources/jobs', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ errorCode: 'invalid_input' });
    const controller = new AbortController();
    request.raw.once('aborted', () => controller.abort());
    return reply
      .header('Cache-Control', 'no-store')
      .send(await findJobs(parsed.data.q, 9, controller.signal));
  });
}
