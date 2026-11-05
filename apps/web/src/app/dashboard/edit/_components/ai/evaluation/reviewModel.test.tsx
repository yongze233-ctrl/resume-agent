import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Resume } from '@/types/frontend/resume';
import type {
  AnalysisEvidenceRef,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';
import {
  parseEvaluationProgress,
  resolveEvidence,
  reviewActive,
  reviewSourceHash,
} from './reviewModel';
import { reviewSourceHash as serverHash } from '../../../../../../../../agent/src/harness/tools/resume-review';
import ResumeEvaluationPanel from './ResumeEvaluationPanel';
import '@/i18n';

const resume = {
  id: 'test',
  name: 'Test resume',
  info: { fullName: 'Test candidate' },
  sections: {
    experience: [
      {
        id: 'role',
        company: 'Example',
        summary: '<p>Delivered a real project.</p>',
        visible: true,
      },
    ],
  },
  sectionOrder: [],
} as unknown as Resume;
const ref: AnalysisEvidenceRef = {
  sectionKey: 'experience',
  itemId: 'role',
  fieldKey: 'summary',
  quote: 'Delivered a real project.',
  path: 'untrusted',
};

test('browser and server use identical content digests for staleness checks', async () => {
  assert.equal(
    await reviewSourceHash(resume),
    serverHash(resume as unknown as Record<string, unknown>),
  );
  assert.equal(
    await reviewSourceHash(resume),
    await reviewSourceHash({ ...resume, info: { ...resume.info } }),
  );
});

test('source expansion rejects stale, hidden and invented references', () => {
  assert.equal(
    resolveEvidence(resume, ref)?.path,
    'sections.experience[role].summary',
  );
  assert.equal(resolveEvidence(resume, { ...ref, quote: 'Made $1m' }), null);
  assert.equal(resolveEvidence(resume, { ...ref, itemId: 'invented' }), null);
  const hidden = {
    ...resume,
    sections: {
      experience: [{ ...resume.sections.experience[0], visible: false }],
    },
  } as Resume;
  assert.equal(resolveEvidence(hidden, ref), null);
});

test('invalid progress is rejected and terminal phases cannot keep scanning', () => {
  assert.equal(
    parseEvaluationProgress({ phase: 'invented', completed: 2 }),
    null,
  );
  assert.equal(
    parseEvaluationProgress({ phase: 'reading', completed: NaN }),
    null,
  );
  assert.equal(
    parseEvaluationProgress({ phase: 'leader_analysis', completed: 40 })
      ?.completed,
    3,
  );
  assert.equal(
    reviewActive({ phase: 'stopped', completed: 1, total: 3 }),
    false,
  );
});

test('evaluation exposes source evidence and context request without an automatic rewrite', () => {
  const persona = {
    persona: 'peer_developer' as const,
    score: 70,
    categories_scores: {},
    strengths: [],
    weaknesses: [],
    suggestions: [],
  };
  const analysis: MultiPersonaResumeAnalysis = {
    overall_score: 70,
    category_averages: {},
    peer_analysis: persona,
    leader_analysis: { ...persona, persona: 'tech_lead' },
    hrbp_analysis: { ...persona, persona: 'hrbp' },
    improvement_actions: [
      {
        id: 'i',
        problem: 'Clarify ownership',
        severity: 'high',
        suggestion: 'Explain your contribution',
        evidence: [ref],
        missingEvidence: ['Your responsibility'],
      },
    ],
  };
  const html = renderToStaticMarkup(
    <ResumeEvaluationPanel
      resume={resume}
      analysis={analysis}
      progress={null}
      running={false}
      canReview
      canFix
      onReview={() => {}}
      onFix={() => {}}
      onClose={() => {}}
    />,
  );
  assert.match(html, /Delivered a real project/);
  assert.match(html, /Your responsibility/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
});
