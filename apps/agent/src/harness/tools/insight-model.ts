import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentChatModel } from '../../model/factory.js';
import type { RunBudget } from '../middleware/run-budget.js';
import { retryable } from '../middleware/model-resilience.js';
import { contentText } from '../middleware/common.js';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
export class InsightError extends Error {
  constructor(
    message: string,
    readonly code = 'assessment_invalid_fields',
  ) {
    super(message);
  }
}
export type InsightInvoker = <T>(
  prompt: string,
  schema: z.ZodType<T>,
  config?: RunnableConfig,
) => Promise<T>;
export function createInsightInvoker(
  model: AgentChatModel,
  budget: RunBudget,
): InsightInvoker {
  return async (prompt, schema, config) => {
    const jsonSchema = toJsonSchema(schema);
    const contract = JSON.stringify(jsonSchema);
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      config?.signal?.throwIfAborted();
      let result;
      try {
        if (!budget.claimInternal())
          throw new InsightError(
            'The shared processing budget is exhausted; report the unfinished assessment.',
            'assessment_budget_exhausted',
          );
        result = await model.invoke(
          `${prompt}\n\nReturn exactly one JSON object matching this schema. Arrays of strings must contain strings, not objects.\n${contract}${correction}`,
          {
            ...config,
            runId: undefined,
            tags: [...(config?.tags ?? []), 'agent:insight'],
          },
        );
      } catch (error) {
        // Internal read-only output is withheld until validated, so a retry
        // cannot duplicate mutations or user-visible text. One extra request
        // total per perspective, including network AND validation failures.
        if (attempt > 0 || !retryable(error, config?.signal)) throw error;
        await dispatchCustomEvent(
          'assessment_validation',
          { code: 'assessment_request_retry', attempt: 1, retrying: true },
          config,
        );
        await delay(200, undefined, { signal: config?.signal });
        continue;
      }
      config?.signal?.throwIfAborted();
      const text = contentText(result.content)
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, '');
      let failure: InsightError;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        /* Classified below; never log model text or resume facts. */
      }
      if (value === undefined) {
        failure = new InsightError(
          'The assessment returned invalid JSON. Return a complete concise JSON object.',
          'assessment_invalid_json',
        );
      } else {
        const validated = schema.safeParse(value);
        if (validated.success) return validated.data;
        // Zod messages/unknown keys may include provider-authored content. Keep
        // only schema-known first-level fields in diagnostics and repair hints.
        const properties =
          (jsonSchema as { properties?: Record<string, unknown> }).properties ??
          {};
        const fields = [
          ...new Set(
            validated.error.issues
              .map((issue) => String(issue.path[0] ?? ''))
              .filter((key) => Object.hasOwn(properties, key)),
          ),
        ];
        failure = new InsightError(
          `The assessment has invalid fields: ${fields.join(', ') || 'root'}. Match the schema types and limits.`,
        );
      }
      await dispatchCustomEvent(
        'assessment_validation',
        { code: failure.code, attempt: attempt + 1, retrying: attempt === 0 },
        config,
      );
      if (attempt === 1) throw failure;
      correction = `\nYour previous attempt failed validation: ${failure.message} Regenerate a concise complete assessment using the same supplied facts; do not invent missing evidence.`;
    }
    throw new InsightError(
      'The assessment did not complete.',
      'assessment_incomplete',
    );
  };
}
