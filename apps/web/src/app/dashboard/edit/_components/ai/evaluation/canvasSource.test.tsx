import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultResume, resumeSchema } from '@magic-resume-kit/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import {
  CANVAS_REVIEW_SECTION,
  canvasReviewDocument,
  hasReviewContent,
  readCanvasReviewSource,
} from './canvasSource';
import ResumeEvaluationPanel from './ResumeEvaluationPanel';
import '@/i18n';

const empty: Resume = {
  ...defaultResume,
  id: 'canvas-only',
  updatedAt: 1,
  name: 'Existing design',
  sections: {},
};
const inspection = {
  width: 595,
  height: 842,
  nodes: [
    {
      id: 'body',
      type: 'TEXT',
      text: '负责需求调研与产品验证。',
      x: 40,
      y: 190,
      width: 400,
      height: 20,
    },
    {
      id: 'name',
      type: 'TEXT',
      text: '陈以宁',
      x: 40,
      y: 40,
      width: 120,
      height: 30,
    },
    {
      id: 'shape',
      type: 'RECTANGLE',
      text: '',
      x: 0,
      y: 0,
      width: 595,
      height: 842,
    },
  ],
};

test('canvas-only reviews use literal node text and preserve the original empty document', () => {
  const before = structuredClone(empty);
  const source = canvasReviewDocument(empty, inspection);
  assert.deepEqual(empty, before);
  assert.equal(hasReviewContent(empty), false);
  assert.equal(hasReviewContent(source), true);
  assert.deepEqual(
    source.sections[CANVAS_REVIEW_SECTION].map((item) => item.id),
    ['name', 'body'],
  );
  assert.equal(
    source.sections[CANVAS_REVIEW_SECTION][1].summary,
    inspection.nodes[0].text,
  );
  assert.equal(resumeSchema.safeParse(source).success, true);
  assert.equal(
    source.info.fullName,
    '',
    'No name is guessed or copied from stale editor fields',
  );
  assert.throws(
    () => canvasReviewDocument(empty, { ...inspection, nodes: [] }),
    /没有可读取/,
  );
});

test('visible but empty editor items do not count as review content', () => {
  assert.equal(
    hasReviewContent({
      sections: {
        experience: [{ id: 'empty', visible: true, summary: '<p> </p>' }],
      },
    }),
    false,
  );
});

test('Start review is enabled when a native design exists without structured sections', () => {
  const render = (hasCanvasSource: boolean, canReview = true) =>
    renderToStaticMarkup(
      <ResumeEvaluationPanel
        resume={empty}
        analysis={null}
        progress={null}
        running={false}
        canReview={canReview}
        canFix
        hasCanvasSource={hasCanvasSource}
        onReview={() => {}}
        onFix={() => {}}
        onClose={() => {}}
      />,
    );
  const enabled = render(true);
  assert.doesNotMatch(enabled, /<button[^>]*disabled/);
  assert.match(enabled, /无需重新上传|No resume upload/);
  assert.match(render(false), /<button[^>]*disabled/);
  assert.match(
    render(true, false),
    /<button[^>]*disabled/,
    'Ask mode remains unable to review a document',
  );
});

test('canvas bridge reads resolve only the matching source, and cancellation releases the listener', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    value: target,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  target.addEventListener('resume-review:read-source', (event) => {
    const detail = (event as CustomEvent).detail;
    if (detail.resumeId === 'correct')
      target.dispatchEvent(
        new CustomEvent('resume-review:source', {
          detail: { ...detail, inspection },
        }),
      );
  });
  assert.deepEqual(await readCanvasReviewSource('correct'), inspection);
  const controller = new AbortController();
  const pending = readCanvasReviewSource('cancelled', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
