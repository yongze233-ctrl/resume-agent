'use client';
import { useState } from 'react';
import { curriculum } from './model';
import styles from './learning-tools.module.css';

type Skill = (typeof curriculum.skills)[number];
export default function SkillLibrary({
  skills = curriculum.skills,
  onAsk,
}: {
  skills?: Skill[];
  onAsk: (text: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null),
    [copied, setCopied] = useState(''),
    [copyError, setCopyError] = useState(false);
  const selected = skills.find((skill) => skill.id === active);
  const copy = async (skill: Skill) => {
    try {
      await navigator.clipboard.writeText(skill.text);
      setCopied(skill.id);
      setCopyError(false);
    } catch {
      setCopyError(true);
      setActive(skill.id);
    }
  };
  const download = (skill: Skill) => {
    const url = URL.createObjectURL(
      new Blob([skill.text], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${skill.id}-SKILL.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={styles.skillLibrary} aria-label="实践 Skill 库">
      <header>
        <h2>把知识变成一次实践。</h2>
        <p>{skills.length} 份完整 Skill，包含工作步骤、检查清单和交付格式。</p>
      </header>
      <div className={styles.skillList}>
        {skills.map((skill) => (
          <article key={skill.id}>
            <div>
              <h3>{skill.title}</h3>
              <p>{skill.description}</p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setActive(active === skill.id ? null : skill.id)}
              >
                {active === skill.id ? '收起正文' : '查看正文'}
              </button>
              <button type="button" onClick={() => void copy(skill)}>
                {copied === skill.id ? '已复制' : '复制 Skill'}
              </button>
              <button type="button" onClick={() => download(skill)}>
                下载
              </button>
              <button
                type="button"
                onClick={() =>
                  onAsk(
                    `我想练习「${skill.title}」。下面是课程中的实践 Skill，请用它指导我的学习，先问清实践对象和已有材料，不要编造我做过的项目。\n\n${skill.text}`,
                  )
                }
              >
                和 AI 一起练
              </button>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <div className={styles.skillText}>
          <h3>{selected.title}</h3>
          {copyError && (
            <p role="alert">
              浏览器未允许自动复制，可以选中下面的正文手动复制。
            </p>
          )}
          <pre tabIndex={0}>{selected.text}</pre>
        </div>
      )}
    </section>
  );
}
