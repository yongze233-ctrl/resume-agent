import type { GraphEvent } from './event-mapper.js';
import { TOOL_DISPLAY } from '../harness/tools/display.js';

export type RunDiagnostic = Record<
  string,
  string | number | boolean | undefined
>;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const numeric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
/** No prompts, arguments, resume text, response bodies or credentials. */
export class RunDiagnostics {
  private starts = new Map<string, { at: number; firstTokenMs?: number }>();
  observe(event: GraphEvent): RunDiagnostic | undefined {
    const { event: kind, run_id: id, data } = event;
    if (kind === 'on_custom_event' && event.name === 'assessment_validation') {
      const codes = [
        'assessment_invalid_json',
        'assessment_invalid_fields',
        'assessment_request_retry',
      ];
      return {
        stage: 'assessment_validation',
        code: codes.includes(String(data.code))
          ? String(data.code)
          : 'assessment_invalid',
        attempt: numeric(data.attempt),
        retrying: data.retrying === true,
      };
    }
    if (kind === 'on_chat_model_start' || kind === 'on_tool_start') {
      this.starts.set(id, { at: Date.now() });
      return;
    }
    const start = this.starts.get(id);
    if (kind === 'on_chat_model_stream') {
      const chunk = object(data.chunk),
        kwargs = object(chunk.additional_kwargs);
      if (
        start &&
        ((typeof chunk.content === 'string' && chunk.content.length > 0) ||
          (Array.isArray(chunk.content) && chunk.content.length > 0) ||
          kwargs.reasoning_content ||
          (Array.isArray(chunk.tool_call_chunks) &&
            chunk.tool_call_chunks.length > 0))
      )
        start.firstTokenMs ??= Date.now() - start.at;
      return;
    }
    if (
      !start ||
      ![
        'on_chat_model_end',
        'on_chat_model_error',
        'on_tool_end',
        'on_tool_error',
      ].includes(kind)
    )
      return;
    this.starts.delete(id);
    const output = object(data.output);
    if (kind.startsWith('on_chat_model')) {
      const usage = object(output.usage_metadata);
      return {
        stage: 'model',
        elapsedMs: Date.now() - start.at,
        firstTokenMs: start.firstTokenMs,
        internal: event.tags?.includes('agent:insight') === true,
        failed: kind.endsWith('_error'),
        inputTokens: numeric(usage.input_tokens),
        outputTokens: numeric(usage.output_tokens),
        reasoningTokens: numeric(object(usage.output_token_details).reasoning),
      };
    }
    let failed = kind.endsWith('_error') || output.status === 'error';
    try {
      const result = JSON.parse(String(output.content));
      failed ||= result?.ok === false || result?.ready === false;
    } catch {
      /* Non-JSON outputs have a status above. */
    }
    return {
      stage: 'tool',
      tool: Object.hasOwn(TOOL_DISPLAY, event.name) ? event.name : 'other',
      elapsedMs: Date.now() - start.at,
      failed,
    };
  }
}
