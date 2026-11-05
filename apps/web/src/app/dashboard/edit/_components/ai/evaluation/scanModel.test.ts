import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotIssueRect, type DesignSnapshot } from './scanModel';
import type { AnalysisImprovementAction } from '@/types/agent/multi-persona';

const snapshot: DesignSnapshot = {
  image: 'data:image/png;base64,AA',
  width: 595,
  height: 842,
  nodes: [
    {
      id: 'first',
      type: 'TEXT',
      text: '独立设计知识库问答流程，验证召回质量。',
      x: 40,
      y: 160,
      width: 420,
      height: 24,
    },
    {
      id: 'second',
      type: 'TEXT',
      text: '上线后需求处理时间缩短了 30%。',
      x: 40,
      y: 200,
      width: 420,
      height: 18,
    },
  ],
};
const issue: AnalysisImprovementAction = {
  id: 'metric',
  problem: '补充统计周期',
  evidence: [
    {
      sectionKey: 'experience',
      itemId: 'role',
      fieldKey: 'summary',
      path: 'unused',
      quote: '上线后需求处理时间缩短了 30%。',
    },
  ],
  missingEvidence: [],
};
test('native design annotations follow the literal matching text node', () => {
  assert.deepEqual(snapshotIssueRect(snapshot, issue), {
    x: 40,
    y: 200,
    width: 420,
    height: 18,
  });
  assert.equal(
    snapshotIssueRect(snapshot, {
      ...issue,
      evidence: [{ ...issue.evidence[0], quote: '不存在的成果与数字' }],
    }),
    null,
  );
});
test('short ambiguous quotes do not create false design locations', () => {
  assert.equal(
    snapshotIssueRect(snapshot, {
      ...issue,
      evidence: [{ ...issue.evidence[0], quote: '30' }],
    }),
    null,
  );
});
