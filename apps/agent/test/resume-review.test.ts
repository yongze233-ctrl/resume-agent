import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reviewChecks,
  reviewSourceHash,
} from '../src/harness/tools/resume-review.js';
import {
  CATEGORIES,
  createAnalyzeResume,
} from '../src/harness/tools/analyze-resume.js';
import type { InsightInvoker } from '../src/harness/tools/insight-model.js';
import { InsightError } from '../src/harness/tools/insight-model.js';
import { captureCustom } from './middleware-helpers.js';
import { resume, waitFor } from './helpers.js';

test('content fingerprint ignores metadata and object order, and detects changed source text', () => {
  const original = reviewSourceHash(resume);
  assert.equal(
    original,
    reviewSourceHash({
      ...resume,
      updatedAt: Date.now(),
      name: 'Renamed',
      info: Object.fromEntries(Object.entries(resume.info).reverse()),
    }),
  );
  assert.notEqual(
    original,
    reviewSourceHash({
      ...resume,
      info: { ...resume.info, fullName: 'Changed' },
    }),
  );
});

test('basic checks distinguish missing content, hidden placeholders and unverified PDF', () => {
  const checks = reviewChecks({
    info: {},
    sections: { hidden: [{ visible: false, summary: '[待填写]' }] },
  });
  assert.equal(checks.find((c) => c.id === 'content')?.status, 'warning');
  assert.equal(checks.find((c) => c.id === 'contact')?.status, 'warning');
  assert.equal(checks.find((c) => c.id === 'placeholders')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'export')?.status, 'unverified');
  assert.equal(
    reviewChecks({
      info: {},
      sections: { projects: [{ summary: '<p>[待填写]</p>' }] },
    }).find((c) => c.id === 'placeholders')?.status,
    'warning',
  );
});

test('progress reflects actual completed reviewers and final report is bound to its source', async () => {
  const invoke: InsightInvoker = async (_prompt, schema) =>
    schema.parse({
      score: 70,
      categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 70])),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      issues: [],
    });
  const { events } = await captureCustom(() =>
    createAnalyzeResume(async () => resume, invoke).invoke({}),
  );
  const progress = events
    .filter((event) => event.name === 'resume_analysis_progress')
    .map((event) => event.data as { phase: string; completed: number });
  assert.deepEqual(
    progress.map((p) => p.completed),
    [0, 0, 1, 2, 3, 3],
  );
  const report = (
    events.find((e) => e.name === 'resume_analysis')!.data as {
      data: Record<string, unknown>;
    }
  ).data;
  assert.equal(report.sourceHash, reviewSourceHash(resume));
  assert.equal(report.rubricVersion, 'resume-review-v1');
  assert.ok(Array.isArray(report.checks));
});

test('reviewers start independently, and a stalled reviewer preserves completed findings without a fabricated total', async () => {
  const started: string[] = [];
  const releases: Array<() => void> = [];
  const invoke: InsightInvoker = async (prompt, schema, config) => {
    started.push(prompt);
    await new Promise<void>((resolve, reject) => {
      releases.push(resolve);
      config?.signal?.addEventListener(
        'abort',
        () => reject(config.signal?.reason),
        { once: true },
      );
    });
    return schema.parse({
      score: 72,
      categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 72])),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      issues: [
        {
          problem: 'Clarify the contribution',
          suggestion: 'Identify the deliverable',
          severity: 'medium',
          evidence: [],
          missingEvidence: ['Deliverable'],
        },
      ],
    });
  };
  const running = captureCustom(async () => {
    try {
      return await createAnalyzeResume(async () => resume, invoke, {
        reviewerTimeoutMs: 80,
      }).invoke({});
    } catch (error) {
      return error;
    }
  });
  await waitFor(() => started.length === 3);
  releases[2]();
  releases[0]();
  const captured = await running;
  const failure = [...captured.events].reverse().find(
    (event) => event.name === 'resume_analysis_progress',
  )?.data as {
    phase: string;
    completed: number;
    findings: unknown[];
    reviewers: Array<{ status: string }>;
  };
  assert.equal(failure.phase, 'failed');
  assert.equal(failure.completed, 2);
  assert.equal(
    failure.reviewers.filter((reviewer) => reviewer.status === 'complete')
      .length,
    2,
  );
  assert.ok(failure.findings.length > 0);
  assert.equal(
    captured.events.some((event) => event.name === 'resume_analysis'),
    false,
  );
  assert.equal(
    (captured.result as { payload: { subCode: string } }).payload.subCode,
    'model_timeout',
  );
});

test('failed or empty assessments never emit a completed report or fabricated score', async () => {
  const bad: InsightInvoker = async () => {
    throw new InsightError('Invalid assessment');
  };
  const failed = await captureCustom(() =>
    createAnalyzeResume(async () => resume, bad).invoke({}),
  );
  assert.equal(
    failed.events.some((e) => e.name === 'resume_analysis'),
    false,
  );
  assert.equal(
    (failed.events.at(-1)!.data as { phase: string }).phase,
    'failed',
  );
  let called = false;
  await captureCustom(() =>
    createAnalyzeResume(
      async () => ({ info: {}, sections: {} }),
      async () => {
        called = true;
        throw new Error('must not call');
      },
    ).invoke({}),
  );
  assert.equal(called, false);
});

test('text reviews omit portrait bytes, design DSL and hidden entries from model input', async () => {
  const prompts: string[] = [];
  const invoke: InsightInvoker = async (prompt, schema) => {
    prompts.push(prompt);
    return schema.parse({
      score: 70,
      categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 70])),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      issues: [],
    });
  };
  await captureCustom(() =>
    createAnalyzeResume(
      async () => ({
        ...resume,
        info: { ...resume.info, avatar: 'PRIVATE_PORTRAIT_BYTES' },
        customTemplate: { marker: 'DESIGN_DSL_MARKER' },
        sections: {
          ...resume.sections,
          hidden: [
            { id: 'hidden', visible: false, summary: 'HIDDEN_TEXT_MARKER' },
          ],
        },
      }),
      invoke,
    ).invoke({}),
  );
  assert.equal(prompts.length, 3);
  for (const prompt of prompts)
    assert.doesNotMatch(
      prompt,
      /PRIVATE_PORTRAIT_BYTES|DESIGN_DSL_MARKER|HIDDEN_TEXT_MARKER/,
    );
});

test('a canvas-only source can be assessed without treating unstructured identity fields as missing', async () => {
  const source = {
    ...resume,
    info: {},
    sections: {
      custom_canvas_review: [
        {
          id: 'native-text',
          visible: true,
          summary: '负责需求调研与产品验证。',
        },
      ],
    },
  };
  const prompts: string[] = [];
  const invoke: InsightInvoker = async (prompt, schema) => {
    prompts.push(prompt);
    return schema.parse({
      score: 75,
      categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 75])),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      issues: [
        {
          problem: '交付范围需要说明',
          suggestion: '补充已有的交付物',
          severity: 'medium',
          evidence: [
            {
              sectionKey: 'custom_canvas_review',
              itemId: 'native-text',
              fieldKey: 'summary',
              quote: '负责需求调研与产品验证。',
            },
          ],
          missingEvidence: ['交付物范围'],
        },
      ],
    });
  };
  const { events } = await captureCustom(() =>
    createAnalyzeResume(async () => source, invoke).invoke({}),
  );
  const result = (
    events.find((e) => e.name === 'resume_analysis')!.data as {
      data: {
        sourceKind: string;
        improvement_actions: Array<{ evidence: Array<{ itemId: string }> }>;
      };
    }
  ).data;
  assert.equal(result.sourceKind, 'canvas');
  assert.equal(result.improvement_actions[0].evidence[0].itemId, 'native-text');
  assert.match(
    prompts[0],
    /blank structured info fields do not mean those facts are absent/,
  );
  const checks = reviewChecks(source);
  assert.equal(checks.find((check) => check.id === 'content')?.status, 'pass');
  assert.equal(
    checks.find((check) => check.id === 'name')?.status,
    'unverified',
  );
  assert.equal(
    checks.find((check) => check.id === 'contact')?.status,
    'unverified',
  );
});
