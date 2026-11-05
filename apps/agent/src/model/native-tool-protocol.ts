import { randomUUID } from 'node:crypto';
import { AgentError } from '../contracts/errors.js';
import { parseDeepSeekCalls } from './deepseek-protocol.js';

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema | undefined>;
  anyOf?: Schema[];
  oneOf?: Schema[];
};
type FunctionSpec = { name: string; parameters?: Schema };
type NativeCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
const invalid = () =>
  new AgentError(502, 'upstream_unavailable', 'model_tool_protocol_invalid');
const decode = (value: string) =>
  value.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, entity: string) =>
      ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[entity]!,
  );
const types = (schema: Schema): string[] => [
  ...(Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : []),
  ...(schema.anyOf ?? schema.oneOf ?? []).flatMap(types),
];

/** Agnes sometimes emits its native call syntax in content instead of tool_calls.
 * Parse only advertised functions and parameter types; the tool's own schema remains
 * the final validator. This never interprets user input, tool results or JavaScript.
 */
export function parseAgnesCalls(
  text: string,
  allowed: ReadonlyMap<string, FunctionSpec>,
): NativeCall[] {
  if (text.length > 1_000_000) throw invalid();
  let rest = text.trim();
  const calls: NativeCall[] = [];
  while (rest) {
    const call =
      /^<tool_call>\s*<function=([\w.-]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/.exec(
        rest,
      );
    const spec = call && allowed.get(call[1]);
    if (!call || !spec || calls.length >= 16) throw invalid();
    let parameters = call[2].trim();
    const args: Record<string, unknown> = Object.create(null);
    while (parameters) {
      const parameter = /^<parameter=([\w.-]+)>([\s\S]*?)<\/parameter>/.exec(
        parameters,
      );
      if (
        !parameter ||
        ['__proto__', 'prototype', 'constructor'].includes(parameter[1]) ||
        Object.hasOwn(args, parameter[1])
      )
        throw invalid();
      const schema = spec.parameters?.properties?.[parameter[1]];
      if (!schema) throw invalid();
      const raw = decode(parameter[2].trim());
      const permitted = types(schema);
      if (permitted.length === 1 && permitted[0] === 'string')
        args[parameter[1]] = raw;
      else {
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          if (!permitted.includes('string')) throw invalid();
          value = raw;
        }
        const type =
          value === null
            ? 'null'
            : Array.isArray(value)
              ? 'array'
              : typeof value;
        if (
          permitted.length &&
          !permitted.includes(type) &&
          !(
            type === 'number' &&
            permitted.includes('integer') &&
            Number.isInteger(value)
          )
        )
          throw invalid();
        args[parameter[1]] = value;
      }
      parameters = parameters.slice(parameter[0].length).trim();
    }
    calls.push({
      id: `call_native_${randomUUID().replaceAll('-', '')}`,
      type: 'function',
      function: { name: call[1], arguments: JSON.stringify(args) },
    });
    rest = rest.slice(call[0].length).trim();
  }
  if (!calls.length) throw invalid();
  return calls;
}

/** Probe only unquoted line starts. A short prefix is held across arbitrary token
 * boundaries; normal prose continues streaming. Markdown examples are not calls.
 */
class NativeToolStream {
  private probe = '';
  private atLineStart = true;
  private fence: { character: string; size: number } | undefined;
  private native: string | undefined;
  standardCalls = false;
  constructor(
    private marker: string,
    private parse: (text: string) => NativeCall[],
  ) {}

  push(text: string): string {
    let output = '';
    for (const character of text) {
      if (this.native !== undefined) {
        this.native += character;
        if (this.native.length > 1_000_000) throw invalid();
        continue;
      }
      if (!this.atLineStart) {
        output += character;
        if (character === '\n') this.atLineStart = true;
        continue;
      }
      this.probe += character;
      const trimmed = this.probe.replace(/^ {0,3}/, '');
      const fenceCandidate = /^(`{3,}|~{3,})/.exec(trimmed);
      if (fenceCandidate || /^(?:`{1,2}|~{1,2})$/.test(trimmed)) {
        if (character !== '\n') {
          if (this.probe.length > 16_384) throw invalid();
          continue;
        }
        if (!this.fence && fenceCandidate)
          this.fence = {
            character: fenceCandidate[1][0],
            size: fenceCandidate[1].length,
          };
        else if (
          this.fence &&
          fenceCandidate &&
          fenceCandidate[1][0] === this.fence.character &&
          fenceCandidate[1].length >= this.fence.size &&
          !trimmed.slice(fenceCandidate[1].length).trim()
        )
          this.fence = undefined;
      } else if (!this.fence && trimmed && this.marker.startsWith(trimmed)) {
        if (trimmed === this.marker) {
          this.native = this.probe;
          this.probe = '';
        }
        continue;
      } else if (!trimmed) continue;
      output += this.probe;
      this.probe = '';
      this.atLineStart = character === '\n';
    }
    return output;
  }

  finish(reason: string) {
    if (this.native !== undefined) {
      // Gateways may return both forms; never run the textual copy a second time.
      if (this.standardCalls) return { text: '', calls: [] };
      if (!['stop', 'tool_calls'].includes(reason)) throw invalid();
      return { text: '', calls: this.parse(this.native) };
    }
    const trimmed = this.probe.trim();
    if (!this.fence && trimmed && this.marker.startsWith(trimmed))
      throw invalid();
    const text = this.probe;
    this.probe = '';
    return { text, calls: [] };
  }
}

/** Normalize provider-native calls before SDK callbacks and checkpoints see them. */
export function providerToolProtocolFetch(
  fetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (url, init) => {
    let request: {
      model?: string;
      stream?: boolean;
      tool_choice?: unknown;
      tools?: Array<{ function?: FunctionSpec }>;
    };
    try {
      request = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    } catch {
      return fetch(url, init);
    }
    const agnes = /^agnes-/i.test(request.model ?? '');
    if ((!agnes && !/deepseek/i.test(request.model ?? '')) || !request.stream)
      return fetch(url, init);
    const allowed = new Map(
      request.tool_choice === 'none'
        ? []
        : (request.tools?.flatMap((tool) =>
            tool.function ? [[tool.function.name, tool.function] as const] : [],
          ) ?? []),
    );
    const response = await fetch(url, init);
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.includes('text/event-stream')
    )
      return response;
    const states = new Map<number, NativeToolStream>();
    const encoder = new TextEncoder();
    let pending = '';
    const stream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream<string, Uint8Array>({
          transform(chunk, controller) {
            pending += chunk;
            let boundary: RegExpExecArray | null;
            while ((boundary = /\r?\n\r?\n/.exec(pending))) {
              const frame = pending.slice(0, boundary.index);
              pending = pending.slice(boundary.index + boundary[0].length);
              const data = frame
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n');
              if (!data || data === '[DONE]') {
                controller.enqueue(encoder.encode(`${frame}\n\n`));
                continue;
              }
              const value = JSON.parse(data);
              for (const choice of value.choices ?? []) {
                const state =
                  states.get(choice.index) ??
                  new NativeToolStream(
                    agnes ? '<tool_call>' : '<｜DSML｜',
                    (text) =>
                      agnes
                        ? parseAgnesCalls(text, allowed)
                        : parseDeepSeekCalls(text, new Set(allowed.keys())),
                  );
                states.set(choice.index, state);
                if (choice.delta?.tool_calls?.length)
                  state.standardCalls = true;
                if (typeof choice.delta?.content === 'string')
                  choice.delta.content = state.push(choice.delta.content);
                if (choice.finish_reason) {
                  const final = state.finish(choice.finish_reason);
                  if (final.text || final.calls.length) {
                    const delta = {
                      ...(final.text ? { content: final.text } : {}),
                      ...(final.calls.length
                        ? {
                            tool_calls: final.calls.map((call, index) => ({
                              index,
                              ...call,
                            })),
                          }
                        : {}),
                    };
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ ...value, choices: [{ index: choice.index, delta, finish_reason: null }], usage: undefined })}\n\n`,
                      ),
                    );
                  }
                  if (final.calls.length) choice.finish_reason = 'tool_calls';
                  states.delete(choice.index);
                }
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
              );
            }
          },
          flush() {
            if (pending.trim() || states.size) throw invalid();
          },
        }),
      );
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
