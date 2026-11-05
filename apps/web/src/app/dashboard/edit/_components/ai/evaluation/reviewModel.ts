import type { Resume } from '@/types/frontend/resume';
import type {
  AnalysisEvidenceRef,
  EvaluationProgress,
} from '@/types/agent/multi-persona';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export async function reviewSourceHash(
  resume: Pick<Resume, 'info' | 'sections' | 'sectionOrder'>,
) {
  const data = new TextEncoder().encode(
    JSON.stringify(
      canonical({
        info: resume.info,
        sections: resume.sections,
        sectionOrder: resume.sectionOrder,
      }),
    ),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos|#39);/g,
      (entity) =>
        ({
          '&nbsp;': ' ',
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&#39;': "'",
        })[entity] ?? entity,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Never trust a persisted report's path or quote after the document changes. */
export function resolveEvidence(resume: Resume, ref: AnalysisEvidenceRef) {
  const items = resume.sections[ref.sectionKey as keyof typeof resume.sections];
  if (!Array.isArray(items)) return null;
  const item = items.find(
    (entry) => entry.id === ref.itemId && entry.visible !== false,
  ) as unknown as Record<string, unknown> | undefined;
  const field = item?.[ref.fieldKey];
  if (typeof field !== 'string' || !ref.quote.trim()) return null;
  const text = plainText(field);
  const quote = plainText(ref.quote);
  if (!text.includes(quote)) return null;
  const title = [
    'company',
    'companyName',
    'name',
    'title',
    'school',
    'schoolName',
    'position',
  ]
    .map((key) => item?.[key])
    .find((value) => typeof value === 'string' && value.trim());
  return {
    text,
    quote,
    title: typeof title === 'string' ? plainText(title) : '',
    path: `sections.${ref.sectionKey}[${ref.itemId}].${ref.fieldKey}`,
  };
}

export const REVIEW_PHASES = [
  'reading',
  'peer_analysis',
  'leader_analysis',
  'hrbp_analysis',
] as const;
export function parseEvaluationProgress(
  value: unknown,
): EvaluationProgress | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (
    ![...REVIEW_PHASES, 'complete', 'failed', 'stopped'].includes(
      p.phase as never,
    ) ||
    typeof p.completed !== 'number' ||
    !Number.isFinite(p.completed)
  )
    return null;
  return {
    phase: p.phase as EvaluationProgress['phase'],
    completed: Math.max(0, Math.min(3, Math.floor(p.completed))),
    total: 3,
    ...(Array.isArray(p.reviewers)
      ? {
          reviewers: p.reviewers.filter(
            (
              entry,
            ): entry is NonNullable<EvaluationProgress['reviewers']>[number] =>
              !!entry &&
              typeof entry === 'object' &&
              ['peer_analysis', 'leader_analysis', 'hrbp_analysis'].includes(
                entry.phase,
              ) &&
              ['running', 'complete', 'failed'].includes(entry.status),
          ),
        }
      : {}),
    ...(Array.isArray(p.findings)
      ? {
          findings: p.findings.filter(
            (
              item,
            ): item is import('@/types/agent/multi-persona').AnalysisImprovementAction =>
              !!item &&
              typeof item === 'object' &&
              typeof item.id === 'string' &&
              typeof item.problem === 'string' &&
              Array.isArray(item.evidence) &&
              Array.isArray(item.missingEvidence),
          ),
        }
      : {}),
  };
}

export function reviewActive(progress: EvaluationProgress | null) {
  return (
    !!progress && !['complete', 'failed', 'stopped'].includes(progress.phase)
  );
}
