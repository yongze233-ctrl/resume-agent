import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, critiqueTemplate } from '@magic-resume-kit/resume-templates/core';
import { buildDesignTemplate, designSpecSchema } from '../src/design/template.js';
import { sourceHash } from '../src/design/artifacts.js';

const resume = {
  info: { fullName: '测试姓名', headline: '内容运营', email: 'test@example.com' },
  sections: {
    projects: [
      { id: 'featured', name: '代表项目', role: '协作', date: '2025.03', summary: '<p>参与3场，触达约3000名会员，没有销售数据。</p>' },
      { id: 'second', name: '另一个项目', summary: '<p>协作制作12篇内容，没有转化率数据。</p>' },
    ],
    experience: [{ id: 'work', company: '测试公司', position: '运营助理', summary: '<p>协助执行。</p>' }],
    education: [{ id: 'edu', school: '测试大学', degree: '本科' }],
    skills: [{ id: 'skill', name: '内容策划' }],
  },
};
const spec = designSpecSchema.parse({
  direction: 'project-cover', featureProjectId: 'featured',
  rationale: '品牌内容岗位应优先阅读代表项目，随后了解工作背景。',
  decisions: [
    { zone: 'identity', reason: '姓名建立第一阅读层级。' },
    { zone: 'projects', reason: '代表项目形成视觉中心。' },
    { zone: 'support', reason: '辅助履历集中呈现。' },
  ],
});

for (const direction of ['project-cover', 'portfolio-sidebar'] as const) {
  test(`${direction} retains source facts in an editable A4 document`, async () => {
    const before = structuredClone(resume);
    const template = buildDesignTemplate({ ...spec, direction });
    assert.equal(template.page?.mode, 'paged');
    assert.equal(template.page?.size, 'A4');
    assert.equal((await critiqueTemplate(template, resume, {})).ok, true);
    const tree = JSON.stringify(compile(template, resume).root);
    for (const fact of ['测试姓名', '代表项目', '另一个项目', '参与3场', '3000', '没有销售数据', '12篇', '没有转化率数据', '测试公司', '运营助理', '协助执行', '测试大学', '本科', '内容策划']) assert.ok(tree.includes(fact), fact);
    assert.deepEqual(resume, before);
    // Candidate facts remain data bindings, so later editing does not require regenerating text.
    assert.ok(!JSON.stringify(template).includes('测试姓名'));
    const changed = structuredClone(resume);
    changed.info.fullName = '更新姓名';
    assert.ok(JSON.stringify(compile(template, changed).root).includes('更新姓名'));
  });
}

test('acceptance fingerprint invalidates changed facts while allowing style-only changes', () => {
  const fingerprint = sourceHash(resume);
  assert.equal(sourceHash({ ...resume, template: 'different', updatedAt: 42 }), fingerprint);
  const changed = structuredClone(resume);
  changed.sections.projects[0].summary = '<p>不同内容。</p>';
  assert.notEqual(sourceHash(changed), fingerprint);
});
