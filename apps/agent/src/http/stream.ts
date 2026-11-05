import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatRequest, ApprovalRequest } from '../contracts/requests.js';
import type { AgentEvent } from '../contracts/events.js';
import { modelError } from '../model/errors.js';
import type { RunEngine } from '../engine/run.js';
import { failureEvents } from '../engine/event-mapper.js';
import { openEventStream } from '../sse.js';
import { randomUUID } from 'node:crypto';
import type { ErrorPayload } from '../contracts/errors.js';

export async function streamRun(
  engine: RunEngine,
  body: ChatRequest | ApprovalRequest,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const startedAt = Date.now();
  const attemptId = randomUUID();
  let lastTool: string | undefined;
  const disconnected = new AbortController();
  const lifetime = new AbortController();
  const timer = setTimeout(
    () =>
      lifetime.abort(
        new DOMException('Run time limit reached', 'TimeoutError'),
      ),
    engine.settings.runTimeoutMs,
  );
  timer.unref();
  const signal = AbortSignal.any([disconnected.signal, lifetime.signal]);
  const onDisconnect = () => {
    if (!reply.raw.writableFinished) disconnected.abort();
  };
  request.raw.once('aborted', onDisconnect);
  reply.raw.once('close', onDisconnect);
  let prepared: Awaited<ReturnType<RunEngine['prepare']>> | undefined;
  let stream: ReturnType<NonNullable<typeof prepared>['stream']> | undefined;
  let send: ReturnType<typeof openEventStream> | undefined;
  let gateTimer: ReturnType<typeof setTimeout> | undefined;
  const rememberFailure = (
    failure: ErrorPayload,
    phase: 'event' | 'stream' | 'prepare',
  ) => {
    try {
      engine.persistence.recordRunFailure(
        prepared?.runId ?? attemptId,
        body.sessionId,
        failure,
        phase,
        Date.now() - startedAt,
        lastTool,
      );
    } catch {
      request.log.warn('Run failure diagnostics could not be saved');
    }
  };
  try {
    prepared = await engine.prepare(body, signal);
    stream = prepared.stream();
    const buffered: AgentEvent[] = [];
    const open = async () => {
      if (send) return;
      signal.throwIfAborted();
      reply.hijack();
      send = openEventStream(reply.raw, prepared!.runId, disconnected.signal);
      await send(prepared!.startedEvent);
      for (const event of buffered) await send(event);
      buffered.length = 0;
      clearTimeout(gateTimer);
    };
    const timeout = Symbol('first-event-timeout');
    const gate = new Promise<typeof timeout>((resolve) => {
      gateTimer = setTimeout(
        () => resolve(timeout),
        engine.settings.firstEventWaitMs,
      );
      gateTimer.unref();
    });
    let pending = stream.next();
    while (true) {
      const next = send ? await pending : await Promise.race([pending, gate]);
      if (next === timeout) {
        await open();
        continue;
      }
      if (next.done) {
        await open();
        break;
      }
      if (next.value.diagnostic)
        request.log.info(
          { runId: prepared.runId, ...next.value.diagnostic },
          'Agent step timing',
        );
      if (
        next.value.modelOutput ||
        next.value.event?.type === 'resume_analysis_progress'
      )
        await open();
      if (next.value.event) {
        if (next.value.event.type === 'tool_started')
          lastTool = next.value.event.payload.toolName;
        if (next.value.event.type === 'resume_analysis_progress') {
          const progress = next.value.event.payload as {
            phase?: string;
            completed?: number;
            reviewers?: Array<{
              phase: string;
              status: string;
              elapsedMs?: number;
              errorCode?: string;
            }>;
          };
          lastTool = `analyze_resume/${progress.phase ?? 'unknown'}`;
          request.log.info(
            {
              runId: prepared.runId,
              stage: 'resume_review',
              phase: progress.phase,
              completed: progress.completed,
              reviewers: progress.reviewers,
            },
            'Resume assessment progress',
          );
        }
        if (next.value.event.type === 'error')
          rememberFailure(next.value.event.payload, 'event');
        if (send) await send(next.value.event);
        else buffered.push(next.value.event);
      }
      pending = stream.next();
    }
  } catch (error) {
    if (!disconnected.signal.aborted) {
      rememberFailure(
        modelError(error, signal).payload,
        send ? 'stream' : 'prepare',
      );
      if (!send) {
        const failure = modelError(error, signal);
        reply.code(failure.status).send(failure.payload);
      } else {
        for (const event of failureEvents(error, signal))
          await send(event).catch(() => {});
      }
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(gateTimer);
    disconnected.abort();
    try {
      await stream?.return(undefined);
    } finally {
      await prepared?.close();
    }
    request.raw.removeListener('aborted', onDisconnect);
    reply.raw.removeListener('close', onDisconnect);
    if (send && !reply.raw.destroyed) reply.raw.end();
  }
}
