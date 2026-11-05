import { tool } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { critiqueTemplate } from '@magic-resume-kit/resume-templates/core';
import { randomUUID } from 'node:crypto';
import type { AgentChatModel } from '../../model/factory.js';
import type { ResumeReader } from './reader.js';
import type { RunBudget } from '../middleware/run-budget.js';
import { contentText } from '../middleware/common.js';
import { buildDesignTemplate, designSpecSchema } from '../../design/template.js';
import { putDesign, type DesignStep } from '../../design/artifacts.js';
import { renderDesign } from '../../design/render.js';

export function createDesignResume(read: ResumeReader, model: AgentChatModel, budget: RunBudget, signal: AbortSignal) {
  return tool(async (input, config) => {
    const resume = await read(config);
    const projects = ((resume.sections as Record<string, unknown>)?.projects ?? []) as Array<{ id: string }>;
    if (!projects.some((project) => project.id === input.featureProjectId)) return 'Choose an existing project ID from read_resume. No design was generated.';
    const widgetId = `design-${randomUUID()}`;
    const steps: DesignStep[] = [{ title: '确定岗位与阅读重点', detail: `根据 JD 选择${input.direction === 'project-cover' ? '项目封面' : '项目与辅助侧栏'}构图；岗位依据与设计决策可在下方展开查看。`, status: 'completed' }];
    let spec = { ...input, decisions: [
      { zone: 'identity' as const, reason: '姓名作为最大字号锚点，职位与联系方式分层排列，先建立候选人身份。' },
      { zone: 'projects' as const, reason: '代表项目位于经历之前；主项目使用浅色底块与大标题，其余项目使用左侧强调线。' },
      { zone: 'experience' as const, reason: input.direction === 'project-cover' ? '工作经历在项目之后使用双栏，保留公司、职位、日期与原文，避免与主项目争夺视觉重点。' : '项目与经历位于主栏，按先项目后经历的顺序阅读。' },
      { zone: 'support' as const, reason: input.direction === 'project-cover' ? '教育与技能在页尾并排呈现，用分隔线与项目区建立层级。' : '教育与技能放入辅助侧栏，主栏保持项目优先的阅读顺序。' },
    ] };
    let template = buildDesignTemplate(spec);
    let latestMetrics: { pages: number; height: number; overflow: boolean } | undefined;
    let review = { completed: false, summary: '', needsAdjustment: false };
    let version = 1;
    const emit = async (status: string) => dispatchCustomEvent('ui_widget', { kind: 'design_proposal', widgetId, props: { status, template, spec, sourceHash: putDesign(resume, template).sourceHash, steps: steps.map((step) => ({ ...step })), metrics: latestMetrics, review, version } }, config);
    await emit('working');
    try {
      for (let round = 0; round < 2; round++) {
        version = round + 1;
        template = buildDesignTemplate(spec);
        steps.push({ title: round ? '修正版式并重新编译' : '生成可编辑版式', detail: round ? '根据上一版的检查结果调整留白与字号。' : `${spec.direction === 'project-cover' ? '项目封面构图' : '项目与辅助侧栏构图'}；正文 ${spec.bodySize}px。`, status: 'running' });
        await emit('working');
        const structural = await critiqueTemplate(template, resume, {});
        if (!structural.ok) throw new Error('模板结构或信息覆盖检查未通过');
        steps[steps.length - 1].status = 'completed';
        steps.push({ title: `渲染第 ${version} 版 A4 预览`, detail: '正在用真实中文字体生成 PDF，检查实际页数与 A4 尺寸。', status: 'running' });
        await emit('working');
        const rendered = await renderDesign(putDesign(resume, template), signal);
        latestMetrics = { pages: rendered.pages, height: rendered.height, overflow: rendered.overflow };
        steps[steps.length - 1] = { title: `渲染第 ${version} 版 A4 预览`, detail: `屏幕内容高度 ${rendered.height}px；实际 PDF ${rendered.pages} 页；${rendered.overflow ? '发现超出单页边界' : 'A4 尺寸与页面边界检查通过'}。`, status: rendered.overflow ? 'failed' : 'completed' };
        await emit('working');
        if (rendered.overflow) {
          if (round === 1) throw new Error('两次排版后仍超出单页，请缩短内容或改用多页方案');
          spec = { ...spec, sectionGap: 12, padding: 28, nameSize: 52, bodySize: 13.5 };
          continue;
        }
        if (rendered.punctuationIssues) throw new Error(`PDF 检出 ${rendered.punctuationIssues} 处行首标点，请调整版式后重试`);
        steps.push({ title: '检查 PDF 中文断行', detail: '逐行检查实际 PDF 文本，未发现逗号、顿号等闭合标点落在行首。', status: 'completed' });
        steps.push({ title: '检查实际页面的视觉层级', detail: '将实际 PDF 页面的渲染图交给图像模型检查。', status: 'running' });
        await emit('working');
        if (!budget.claimInternal()) throw new Error('本轮预算不足，视觉检查未执行');
        const response = await model.invoke([new HumanMessage({ content: [
          { type: 'text', text: `你是简历版式审稿人。查看这张真实渲染的简历，检查文字重叠、裁切、正文是否过密、姓名和项目是否有明确主次。请只输出 JSON：{"summary":"中文简短说明可见结果","needsAdjustment":false}。发现明显视觉问题才将 needsAdjustment 设为 true。不要虚构检查。设计目标：${spec.rationale}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${rendered.image.toString('base64')}` } },
        ] })], { ...config, tags: [...(config?.tags ?? []), 'agent:insight'] });
        const parsed = JSON.parse(contentText(response.content).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { summary?: string; needsAdjustment?: boolean };
        if (typeof parsed.summary !== 'string' || typeof parsed.needsAdjustment !== 'boolean') throw new Error('视觉模型未返回有效检查结果');
        review = { completed: true, summary: parsed.summary.slice(0, 800), needsAdjustment: parsed.needsAdjustment };
        steps[steps.length - 1] = { title: '检查实际页面的视觉层级', detail: review.summary, status: review.needsAdjustment ? 'failed' : 'completed' };
        if (review.needsAdjustment && round === 0) {
          spec = { ...spec, sectionGap: 16, padding: 32, nameSize: Math.min(spec.nameSize, 60), bodySize: 13.5 };
          await emit('working');
          continue;
        }
        if (review.needsAdjustment) throw new Error('视觉检查仍发现问题，设计未标记为完成');
        steps.push({ title: '准备采纳与导出', detail: '原始履历事实保持不变。方案通过检查，等待用户采纳。', status: 'completed' });
        await emit('ready');
        return JSON.stringify({ ready: true, version, pages: rendered.pages, finalDesign: { direction: spec.direction, nameSizePx: spec.nameSize, bodySizePx: spec.bodySize, paddingPx: spec.padding, sectionGapPx: spec.sectionGap }, visualReview: review.summary, instruction: 'The design preview and real process are shown in the side panel. Reply in at most three short Chinese sentences: describe the visual hierarchy, say the actual A4 render and review passed, and point to the side panel for apply/export. Do not list numeric typography or spacing values: initial arguments may have been adjusted automatically. Do not claim it is saved and do not write resume.json for style-only changes.' });
      }
      throw new Error('设计未完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : '设计执行失败';
      if (steps.at(-1)?.status === 'running') steps[steps.length - 1].status = 'failed';
      steps.push({ title: '需要继续修正', detail: message.slice(0, 180), status: 'failed' });
      await emit('failed');
      return JSON.stringify({ ready: false, error: message.slice(0, 180), instruction: 'The design is incomplete. Explain the actual limitation; never claim success.' });
    }
  }, { name: 'design_resume', description: 'Design a distinctive editable resume from its real source facts. Builds a constrained layout, actually renders A4 in Chromium, checks coverage and overflow, obtains visual model review, retries once, then presents a reviewable design and real progress in the side panel. Choose an existing featureProjectId; supply JD-backed rationale and concrete design decisions. Does not save until browser acceptance.', schema: designSpecSchema });
}
