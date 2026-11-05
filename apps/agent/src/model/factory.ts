import {
  ChatOpenAICompletions,
  convertCompletionsDeltaToBaseMessageChunk,
} from '@langchain/openai';
import { SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { ModelConfig } from '../contracts/model-config.js';
import { rejectsEffort, safeModelFailure } from './errors.js';
import { randomUUID } from 'node:crypto';
import { providerToolProtocolFetch } from './native-tool-protocol.js';

const opencodeSession = `ses_magic_resume_${randomUUID().replaceAll('-', '')}`;

/** OpenCode Go requires a session header in addition to the BYOK bearer key. */
export function opencodeGoHeaders(
  baseUrl: string,
): Record<string, string> | undefined {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'opencode.ai')
    return undefined;
  if (!/^\/(?:zen\/go\/v1|inference\/go\/openai\/v1)\/?$/.test(url.pathname))
    return undefined;
  return { 'x-opencode-session': opencodeSession };
}

type Delta = Parameters<typeof convertCompletionsDeltaToBaseMessageChunk>[0];

export class AgentChatModel extends ChatOpenAICompletions {
  // Only answer text and tool-call fragments commit a response. A disconnected
  // reasoning-only attempt can retry this model round without repeating tools.
  emitted = 0;
  model_name?: string;
  systemSuffix?: string;
  prepareMessages?: (messages: BaseMessage[]) => Promise<BaseMessage[]>;
  private finalInstructions(messages: BaseMessage[]): BaseMessage[] {
    if (!this.systemSuffix) return messages;
    const marker = '\n\nPermission boundary:';
    let lastSystem = -1;
    messages.forEach((message, index) => {
      if (message.getType() === 'system') lastSystem = index;
    });
    if (lastSystem < 0)
      return [new SystemMessage(`${marker} ${this.systemSuffix}`), ...messages];
    return messages.map((message, index) => {
      if (message.getType() !== 'system') return message;
      const blocks =
        typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : message.content;
      const content = blocks.filter(
        (block) =>
          !(
            block.type === 'text' &&
            typeof block.text === 'string' &&
            block.text.startsWith(marker)
          ),
      );
      if (index === lastSystem)
        content.push({ type: 'text', text: `${marker} ${this.systemSuffix}` });
      return new SystemMessage({ ...message, content });
    });
  }
  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, unknown>,
    response: Delta['rawResponse'],
    defaultRole?: Delta['defaultRole'],
  ) {
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (
      delta.content ||
      (Array.isArray(delta.tool_calls) && delta.tool_calls.length)
    )
      this.emitted++;
    const chunk = super._convertCompletionsDeltaToBaseMessageChunk(
      { ...delta, reasoning_content: reasoning },
      response,
      defaultRole,
    );
    return chunk;
  }
  // Reasoning stays in `additional_kwargs.reasoning_content`. Moving it into `content` turns
  // the merged reply into one text part per streamed chunk, which the next request sends back
  // to the provider; some providers join those parts with line breaks and the model copies it.
  override async *_streamResponseChunks(
    ...args: Parameters<ChatOpenAICompletions['_streamResponseChunks']>
  ) {
    try {
      yield* super._streamResponseChunks(
        this.finalInstructions(
          this.prepareMessages ? await this.prepareMessages(args[0]) : args[0],
        ),
        args[1],
        args[2],
      );
    } catch (error) {
      throw safeModelFailure(error, args[1].signal);
    }
  }
}

/** Effort negotiation is limited to one rejected request; the provider and model never change. */
export function effortCompatibleFetch(
  fetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  let unsupported = false;
  return async (url, init) => {
    let body: Record<string, unknown> | undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        /* Non-JSON bodies pass through. */
      }
    }
    const options = () =>
      body ? { ...init, body: JSON.stringify(body) } : init;
    if (unsupported && body) delete body.reasoning_effort;
    const response = await fetch(url, options());
    if (!body?.reasoning_effort || ![400, 422].includes(response.status))
      return response;
    const detail: unknown = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (
      !rejectsEffort({
        status: response.status,
        ...(detail && typeof detail === 'object' ? detail : {}),
      })
    )
      return response;
    await response.body?.cancel();
    unsupported = true;
    delete body.reasoning_effort;
    return fetch(url, options());
  };
}

export function createChatModel(
  config: ModelConfig,
  fetch: typeof globalThis.fetch,
) {
  return new AgentChatModel({
    apiKey: config.apiKey,
    model: config.modelName,
    maxTokens: config.maxTokens,
    streaming: true,
    verbose: false,
    streamUsage: true,
    maxRetries: 0,
    modelKwargs: providerModelKwargs(config),
    configuration: {
      baseURL: config.baseUrl,
      defaultHeaders: opencodeGoHeaders(config.baseUrl),
      fetch: providerToolProtocolFetch(effortCompatibleFetch(fetch)),
      maxRetries: 0,
      logLevel: 'off',
    },
  });
}

/** Agnes documents Thinking via chat_template_kwargs, not reasoning_effort. */
export function providerModelKwargs(
  config: ModelConfig,
): Record<string, unknown> {
  const host = new URL(config.baseUrl).hostname;
  if (
    ['apihub.agnes-ai.com', 'api.agnes-ai.cn'].includes(host) &&
    /^agnes-/.test(config.modelName)
  ) {
    return config.effort
      ? { chat_template_kwargs: { enable_thinking: config.effort !== 'low' } }
      : {};
  }
  return config.effort ? { reasoning_effort: config.effort } : {};
}
