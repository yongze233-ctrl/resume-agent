import type { FastifyReply, FastifyRequest } from 'fastify';

/** Allow a bounded error response to reach a streaming uploader before closing. */
export function drainRejectedUpload(request: FastifyRequest) {
  if (request.raw.complete || request.raw.destroyed) return;
  const timer = setTimeout(() => request.raw.destroy(), 1000);
  timer.unref();
  const clear = () => clearTimeout(timer);
  request.raw.once('end', clear);
  request.raw.once('close', clear);
  request.raw.resume();
}

/** Keep cancellation active through downloads, extraction and non-streaming model work. */
export function requestLifetime(
  request: FastifyRequest,
  reply: FastifyReply,
  timeoutMs: number,
) {
  const disconnected = new AbortController();
  const deadline = new AbortController();
  const onDisconnect = () => {
    if (!reply.raw.writableFinished) disconnected.abort();
  };
  const timer = setTimeout(
    () => deadline.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  timer.unref();
  request.raw.once('aborted', onDisconnect);
  reply.raw.once('close', onDisconnect);
  return {
    signal: AbortSignal.any([disconnected.signal, deadline.signal]),
    disconnectedSignal: disconnected.signal,
    close() {
      clearTimeout(timer);
      request.raw.removeListener('aborted', onDisconnect);
      reply.raw.removeListener('close', onDisconnect);
    },
  };
}
