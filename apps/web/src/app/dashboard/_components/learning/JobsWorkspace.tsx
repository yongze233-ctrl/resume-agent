'use client';
import { useEffect, useState } from 'react';
import type { ResourceTarget } from './workspaceTarget';
import { jobTarget } from './workspaceTarget';
import styles from './resource-workspace.module.css';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  checkedAt: string;
  matchedTerms: string[];
}
export default function JobsWorkspace({
  selected,
  query: initialQuery,
  onSelect,
  onAsk,
}: {
  selected?: { url: string; title: string };
  query?: string;
  onSelect: (target: ResourceTarget) => void;
  onAsk: (text: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery || 'AI 产品经理 Agent RAG');
  const [applied, setApplied] = useState(query),
    [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ jobs: Job[]; status: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(!!selected);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/career/job?url=${encodeURIComponent(selected.url)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('job_unavailable');
        const data = await response.json();
        if (!controller.signal.aborted) setDetail(data.job ?? null);
      })
      .catch(() => {
        /* The related list and original employer link remain usable. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/career/jobs?q=${encodeURIComponent(applied)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('jobs_unavailable');
        const data = await response.json();
        if (!controller.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ status: 'unavailable', jobs: [] });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied, refresh]);
  const current =
    detail ??
    result?.jobs.find(
      (job) => jobTarget(job.url, job.title)?.job?.url === selected?.url,
    );
  const search = () => {
    if (!query.trim()) return;
    setLoading(true);
    setApplied(query.trim().slice(0, 300));
    setRefresh((previous) => previous + 1);
  };
  return (
    <div className={styles.jobs}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          aria-label="在工作区搜索岗位"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入角色或能力关键词"
        />
        <button type="submit">查找岗位</button>
      </form>
      {selected && (
        <section className={styles.jobDetail} aria-label="岗位详情">
          <span className={styles.kicker}>当前选择的岗位</span>
          <h2>{current?.title ?? selected.title}</h2>
          {current && (
            <p className={styles.jobMeta}>
              {current.company} / {current.location} /{' '}
              {new Date(current.checkedAt).toLocaleDateString('zh-CN')} 核对
            </p>
          )}
          {detailLoading ? (
            <p role="status">正在读取招聘源…</p>
          ) : current ? (
            <>
              <h3>岗位摘要</h3>
              <p className={styles.description}>{current.description}</p>
              <div className={styles.tags}>
                {current.matchedTerms.slice(0, 6).map((term) => (
                  <span key={term}>{term}</span>
                ))}
              </div>
            </>
          ) : (
            <p>
              暂未读取到这条职位的详细信息，可以继续浏览相关岗位，或查看企业原文。
            </p>
          )}
          <div className={styles.detailActions}>
            <button
              type="button"
              onClick={() =>
                onAsk(
                  `请结合我的简历和当前对话，核对「${current?.title ?? selected.title}」这个岗位需要哪些经历证据，哪些信息还需要确认，并推荐本站相关课程。岗位链接：${selected.url}。不要凭关键词重合直接判断个人匹配度。`,
                )
              }
            >
              让 AI 帮我核对经历
            </button>
            <a href={selected.url} target="_blank" rel="noopener noreferrer">
              查看企业招聘原文 ↗
            </a>
          </div>
        </section>
      )}
      <div className={styles.jobListHeading}>
        <h2>{selected ? '相关岗位' : '可以继续了解的岗位'}</h2>
        <span>来自腾讯、OpenAI、Anthropic 招聘源</span>
      </div>
      {loading ? (
        <p className={styles.empty} role="status">
          正在查找相关岗位…
        </p>
      ) : (
        <div className={styles.jobList}>
          {result?.jobs.map((job) => {
            const target = jobTarget(job.url, job.title);
            return (
              target && (
                <article key={job.id}>
                  <a
                    href={job.url}
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      onSelect(target);
                    }}
                  >
                    <h3>{job.title}</h3>
                    <p>
                      {job.company} / {job.location}
                    </p>
                  </a>
                  <span>
                    {new Date(job.checkedAt).toLocaleDateString('zh-CN')} 核对
                  </span>
                </article>
              )
            );
          })}
          {!result?.jobs.length && (
            <p className={styles.empty}>
              {result?.status === 'unavailable'
                ? '招聘源暂未连接，稍后可重新查找。'
                : '没有找到对应岗位，换个角色或关键词试试。'}
            </p>
          )}
        </div>
      )}
      <p className={styles.notice}>
        岗位先按方向关联，个人匹配度需要结合真实经历核实。
      </p>
    </div>
  );
}
