import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { createMiddleware } from 'langchain';
import { AgentError } from '../../contracts/errors.js';
import { contentText, denied } from './common.js';

export const NAME = 'RunBudget';
const wrapUp =
  'The processing budget is exhausted. Tools are disabled. Summarize confirmed results and explicitly identify unfinished work. Resume edits remain proposals for user review.';
const fallback =
  'The processing budget is exhausted. Review any proposals already produced; the remaining work needs another turn.';
export function createRunBudget(limits: {
  modelCalls: number;
  toolCalls: number;
  searches?: number;
}) {
  let models = 0;
  let tools = 0;
  let searches = 0;
  let emptyRecoveries = 0;
  let completionReason: string | undefined;
  return {
    counts: () => ({ models, tools, searches }),
    requestWrapUp(reason: string) {
      completionReason = reason;
    },
    claimSearch() {
      if (searches >= (limits.searches ?? 5)) return false;
      searches++;
      return true;
    },
    claimInternal() {
      if (models >= limits.modelCalls - 1) return false;
      models++;
      return true;
    },
    middleware(scope: 'root' | 'child' = 'root') {
      return createMiddleware({
        name: NAME,
        wrapModelCall: async (request, handler) => {
          if (scope === 'child' && models >= limits.modelCalls - 1)
            return new AIMessage(
              'Return existing results to the parent. The shared processing budget is exhausted.',
            );
          if (models >= limits.modelCalls)
            return new AIMessage({
              content: fallback,
              additional_kwargs: { budgetFallback: true },
            });
          models++;
          const final =
            models === limits.modelCalls ||
            tools >= limits.toolCalls ||
            completionReason !== undefined;
          let response = await handler(
            final
              ? {
                  ...request,
                  tools: [],
                  toolChoice: 'none',
                  systemMessage: (
                    request.systemMessage ??
                    new SystemMessage(request.systemPrompt ?? '')
                  ).concat(
                    `\n\n${completionReason ? `${completionReason}\nTools are disabled. Summarize confirmed results and unfinished work; do not claim approval.` : wrapUp}`,
                  ),
                }
              : request,
          );
          const empty = () =>
            !response.tool_calls?.length &&
            !response.invalid_tool_calls?.length &&
            !contentText(response.content).trim();
          if (
            !final &&
            empty() &&
            emptyRecoveries < 1 &&
            models < limits.modelCalls - 1 &&
            !request.runtime.signal?.aborted
          ) {
            // No tool call was emitted, so only this model request is repeated.
            // Previously successful tool mutations remain in the same graph state.
            emptyRecoveries++;
            models++;
            await dispatchCustomEvent('model_retry', {
              reason: 'empty_response',
              attempt: emptyRecoveries,
              limit: 1,
            });
            response = await handler({
              ...request,
              systemMessage: (
                request.systemMessage ??
                new SystemMessage(request.systemPrompt ?? '')
              ).concat(
                '\n\nThe last model attempt returned no assistant text and no tool calls. Nothing ran in that attempt. Continue the unfinished task from the last confirmed tool result. Correct any failed validation, reuse existing artifacts and IDs, and do not replay successful mutations. If blocked, explain the actual reason instead of returning an empty response. Only mark steps complete after verification.',
              ),
            });
          }
          if (
            final &&
            (response.tool_calls?.length ||
              response.invalid_tool_calls?.length ||
              !contentText(response.content).trim())
          )
            return new AIMessage({
              content: completionReason ?? fallback,
              additional_kwargs: { budgetFallback: true },
            });
          if (
            !response.tool_calls?.length &&
            !response.invalid_tool_calls?.length &&
            !contentText(response.content).trim()
          )
            throw new AgentError(
              502,
              'upstream_unavailable',
              'model_response_empty',
            );
          return response;
        },
        afterModel: async (state) => {
          const last = state.messages.at(-1);
          if (last?.additional_kwargs.budgetFallback)
            await dispatchCustomEvent('budget_summary', {
              content: contentText(last.content),
            });
        },
        wrapToolCall: (request, handler) => {
          if (tools >= limits.toolCalls)
            return denied(
              request.toolCall,
              'Tool budget exhausted. This call was not executed. Summarize existing results and unfinished work.',
            );
          tools++;
          return handler(request);
        },
      });
    },
  };
}
export type RunBudget = ReturnType<typeof createRunBudget>;
