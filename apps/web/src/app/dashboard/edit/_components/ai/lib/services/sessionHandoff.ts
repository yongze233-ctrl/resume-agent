import { AgentRequestError } from './agentClient';
import type { AgentSseEvent } from './types';

/** Retry only admission conflicts, before any stream event could have executed work. */
export async function* streamWhenSessionReady(
  makeStream: () => AsyncGenerator<AgentSseEvent>,
  signal: AbortSignal,
  waitMs = 0,
): AsyncGenerator<AgentSseEvent> {
  const deadline = Date.now() + waitMs;
  let emitted = false;
  for (;;) {
    signal.throwIfAborted();
    try {
      for await (const event of makeStream()) { emitted = true; yield event; }
      return;
    } catch (error) {
      if (emitted || !(error instanceof AgentRequestError)
        || error.appError.subCode !== 'session_busy' || Date.now() >= deadline) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, Math.min(120, Math.max(1, deadline - Date.now())));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
      });
    }
  }
}
