import source from '@/data/learning/xueai.json';

export const curriculum = source;
export type Ability = (typeof source.abilities)[number];
export type Lesson = (typeof source.lessons)[number];
export type Question = (typeof source.questions)[number];

/** Recommendations establish topic relevance, not evidence of personal competence. */
export function matchLearningAbilities(text: string) {
  const low = text.toLowerCase();
  return source.abilities
    .map((ability) => ({
      ...ability,
      hits: ability.keywords.filter((keyword) => {
        const word = keyword.toLowerCase();
        if (/^[\x20-\x7E]+$/.test(word))
          return new RegExp(
            `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          ).test(low);
        return low.includes(word);
      }),
    }))
    .filter((ability) => ability.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);
}

export function questionsFor(ability: Ability) {
  return source.questions
    .filter(
      (question) =>
        question.lessonFile && ability.lessons.includes(question.lessonFile),
    )
    .slice(0, 3);
}

export const SAMPLE_JD = `AI 产品经理 · Agent / RAG 方向
负责企业知识库与 AI Agent 产品，推动从需求分析到上线验证的完整迭代。
理解 RAG 的检索、Embedding、召回与重排序，能在准确率、延迟和成本之间做取舍。
能够设计 Agent 评测体系，构建测试集并开展效果评估。
掌握 Prompt 与上下文工程，支持多轮任务、工具调用和记忆管理。
关注权限、人工审批和安全治理，具备跨团队协作与产品落地能力。`;

export const exampleEvidence: Record<
  string,
  { quote: string; note: string; status: 'verify' | 'clue' }
> = {
  rag: {
    quote: '搭建企业知识库问答原型，完成文档解析与向量检索。',
    note: '有原型线索，尚需核对召回、重排与质量验证的具体做法。',
    status: 'verify',
  },
  eval: {
    quote: '推动 AI 问答功能迭代，收集用户反馈。',
    note: '简历暂未写出测试集、评测口径和验证结果，先补证据再下结论。',
    status: 'verify',
  },
  'context-eng': {
    quote: '实现多轮问答与上下文截断，控制会话 Token 开销。',
    note: '已找到经历线索，下一步核对职责范围与可复述的方案。',
    status: 'clue',
  },
  governance: {
    quote: '参与企业内部 Agent 工作流的设计。',
    note: '权限边界与人工确认机制暂未说明，可以通过小任务补充验证。',
    status: 'verify',
  },
};
