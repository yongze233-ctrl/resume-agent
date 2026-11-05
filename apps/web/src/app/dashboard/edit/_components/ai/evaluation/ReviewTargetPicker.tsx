'use client';
import type { useReviewWorkspace } from './useReviewWorkspace';
import { frameReviewKey, type ReviewTarget } from './reviewTargets';
import styles from './review-workspace.module.css';

export type ReviewWorkspaceControls = Pick<
  ReturnType<typeof useReviewWorkspace>,
  | 'targets'
  | 'selectedIds'
  | 'viewedTarget'
  | 'records'
  | 'batch'
  | 'toggleTarget'
  | 'selectAll'
> & {
  designId: string;
  onView: (target: ReviewTarget) => void;
  onRefresh: () => void;
  legacyReport?: boolean;
};

export default function ReviewTargetPicker({
  workspace,
  busy,
  loading,
}: {
  workspace: ReviewWorkspaceControls;
  busy: boolean;
  loading: boolean;
}) {
  return (
    <section className={styles.targetPicker} aria-label="选择评估简历">
      <div className={styles.targetHeading}>
        <strong>评估对象</strong>
        <button
          type="button"
          disabled={busy || loading}
          onClick={workspace.onRefresh}
          aria-label="刷新简历画板列表"
        >
          刷新
        </button>
      </div>
      {loading && !workspace.targets.length ? (
        <p role="status">正在读取画板…</p>
      ) : (
        <>
          <div className={styles.targetList}>
            {workspace.targets.map((target, i) => {
              const record =
                workspace.records[
                  frameReviewKey(workspace.designId, target.id)
                ];
              const active = workspace.viewedTarget?.id === target.id;
              const order = workspace.targets
                .filter((frame) => workspace.selectedIds.includes(frame.id))
                .findIndex((frame) => frame.id === target.id);
              const waiting = workspace.batch && order >= workspace.batch.index;
              const status =
                workspace.batch && active
                  ? '评估中'
                  : waiting
                    ? '等待评估'
                    : record?.progress?.phase === 'complete' && record.analysis
                      ? `${Math.round(record.analysis.overall_score)} 分`
                      : record?.progress
                        ? '未完成'
                        : '待评估';
              return (
                <div
                  key={target.id}
                  className={styles.targetRow}
                  data-active={active}
                >
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`评估 ${target.name}`}
                      checked={workspace.selectedIds.includes(target.id)}
                      disabled={busy}
                      onChange={() => workspace.toggleTarget(target.id)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`查看 ${target.name} 的评估`}
                    aria-pressed={active}
                    onClick={() => workspace.onView(target)}
                  >
                    <span>{target.name || `简历 ${i + 1}`}</span>
                    <small>
                      {target.pageName} · 画板 {i + 1}
                    </small>
                  </button>
                  <b>{status}</b>
                </div>
              );
            })}
          </div>
          {workspace.targets.length > 1 && (
            <div className={styles.targetSelection}>
              <span>
                已选 {workspace.selectedIds.length} / {workspace.targets.length}{' '}
                份
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={workspace.selectAll}
              >
                {workspace.selectedIds.length === workspace.targets.length
                  ? '取消全选'
                  : '全选'}
              </button>
            </div>
          )}
        </>
      )}
      <p>
        {workspace.targets.length > 1
          ? '每份简历单独评分，批注只标在对应画板上。'
          : '报告与当前简历画板绑定。'}
      </p>
      {workspace.legacyReport && workspace.targets.length > 0 && (
        <p>旧评估未标记到具体版本，请选择简历重新评估。</p>
      )}
      {workspace.batch ? (
        <p role="status" className={styles.batchStatus}>
          正在评估 {workspace.batch.index} / {workspace.batch.total} ·{' '}
          {workspace.batch.targetName}
        </p>
      ) : (
        workspace.viewedTarget && (
          <p className={styles.reportTarget}>
            当前报告：{workspace.viewedTarget.name}
          </p>
        )
      )}
    </section>
  );
}
