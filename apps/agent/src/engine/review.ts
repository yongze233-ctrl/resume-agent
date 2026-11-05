import type { ChatRequest } from '../contracts/requests.js';
import { AgentError } from '../contracts/errors.js';
import { createChatModel } from '../model/factory.js';
import { createAnalyzeResume } from '../harness/tools/analyze-resume.js';
import { createInsightInvoker } from '../harness/tools/insight-model.js';
import { createRunBudget } from '../harness/middleware/run-budget.js';
import { EventMapper } from './event-mapper.js';
import { ResumeAccumulator } from './resume-accumulator.js';
import type { StreamItem } from './run.js';
import { RunDiagnostics } from './run-diagnostics.js';

/** The explicit Review action already specifies the task and its read-only source.
 * Execute the assessment directly, without extra planner/summarizer model rounds. */
export function prepareResumeReview(
  request: ChatRequest,
  runId: string,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal,
  close: () => Promise<void>,
) {
  if (request.agentMode === 'ask' || !request.currentResume)
    throw new AgentError(400, 'invalid_input', 'resume_unavailable');
  const source = request.currentResume;
  // Keep the user's provider and model. Bound only this structured assessment workload.
  const model = createChatModel(
    {
      ...request.config,
      effort: 'low',
      maxTokens: Math.min(request.config.maxTokens ?? 4096, 4096),
    },
    fetch,
  );
  // Three initial assessments plus a bounded retry per perspective. The budget
  // reserves one final model slot, unused by this direct review workflow.
  const budget = createRunBudget({ modelCalls: 7, toolCalls: 1 });
  const tool = createAnalyzeResume(
    async () => source,
    createInsightInvoker(model, budget),
    { propagateInsightErrors: true },
  );
  const mapper = new EventMapper(
    new ResumeAccumulator(source, request.agentMode),
  );
  const diagnostics = new RunDiagnostics();
  return {
    runId,
    startedEvent: mapper.begin()[0],
    async *stream(): AsyncGenerator<StreamItem> {
      let completed = false;
      yield { event: mapper.skillLoaded('resume-analysis')[0] };
      for await (const raw of tool.streamEvents(
        {},
        { version: 'v2', signal },
      )) {
        signal.throwIfAborted();
        const diagnostic = diagnostics.observe(raw);
        if (diagnostic) yield { diagnostic };
        if (mapper.hasModelOutput(raw)) yield { modelOutput: true };
        for (const event of mapper.map(raw)) {
          if (event.type === 'resume_analysis') completed = true;
          yield { event };
        }
      }
      signal.throwIfAborted();
      if (!completed)
        throw new AgentError(
          502,
          'upstream_unavailable',
          'resume_review_incomplete',
        );
      yield {
        event: {
          type: 'message_chunk',
          content:
            '评估已完成。右侧已更新评分和原文批注，可以点击简历上的标记逐项查看，并在对话里继续修改。',
        },
      };
      yield { event: { type: 'run_completed' } };
      yield { event: { type: 'done' } };
    },
    close,
  };
}
