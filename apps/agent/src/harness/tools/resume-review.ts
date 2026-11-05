import { createHash } from 'node:crypto';
import { stripTags } from '../../text.js';

export const REVIEW_VERSION = 'resume-review-v1';

// The digest covers evaluated content, not local save timestamps or editor theme.
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
export function reviewSourceHash(resume: Record<string, unknown>) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          info: resume.info,
          sections: resume.sections,
          sectionOrder: resume.sectionOrder,
        }),
      ),
    )
    .digest('hex');
}

export type ReviewCheck = {
  id: string;
  status: 'pass' | 'warning' | 'unverified';
  detail: string;
};

/** Objective checks stay separate from subjective model scores. */
export function reviewChecks(resume: Record<string, unknown>): ReviewCheck[] {
  const info = (resume.info ?? {}) as Record<string, unknown>;
  const sections = (resume.sections ?? {}) as Record<string, unknown>;
  const canvasSource = Array.isArray(sections.custom_canvas_review);
  const entries = Object.values(sections).flatMap((value) =>
    Array.isArray(value)
      ? value.filter((item) => item && item.visible !== false)
      : [],
  );
  const text = entries
    .map((item) =>
      Object.entries(item)
        .filter(([key]) => !['id', 'visible', 'icon'].includes(key))
        .map(([, value]) =>
          typeof value === 'string' ? stripTags(value, ' ') : '',
        )
        .join(' '),
    )
    .join(' ');
  const hasName =
    typeof info.fullName === 'string' && info.fullName.trim().length > 0;
  const hasContact = [info.email, info.phoneNumber].some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  const placeholders =
    /\[\s*(?:待填写|待填|公司名称|学校名称|你的姓名)\s*\]|\b(?:TODO|YOUR NAME)\b/i.test(
      `${text} ${info.fullName ?? ''}`,
    );
  return [
    {
      id: 'name',
      status: canvasSource ? 'unverified' : hasName ? 'pass' : 'warning',
      detail: canvasSource
        ? 'canvas_field_unverified'
        : hasName
          ? 'name_present'
          : 'name_missing',
    },
    {
      id: 'contact',
      status: canvasSource ? 'unverified' : hasContact ? 'pass' : 'warning',
      detail: canvasSource
        ? 'canvas_field_unverified'
        : hasContact
          ? 'contact_present'
          : 'contact_missing',
    },
    {
      id: 'content',
      status: text.trim() ? 'pass' : 'warning',
      detail: text.trim()
        ? canvasSource
          ? 'canvas_content_present'
          : 'content_present'
        : 'content_missing',
    },
    {
      id: 'placeholders',
      status: placeholders ? 'warning' : 'pass',
      detail: placeholders ? 'placeholders_found' : 'placeholders_clear',
    },
    { id: 'export', status: 'unverified', detail: 'export_unverified' },
  ];
}
