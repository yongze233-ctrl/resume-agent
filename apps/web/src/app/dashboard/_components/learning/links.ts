/** Keep resource links tied to the chat that recommended them. */
import lessonIds from '@/data/learning/lesson-ids.json';
const knownLessons = new Set(lessonIds);
export function learningHref(
  lessonId?: string,
  resumeId?: string,
  query?: string,
) {
  const params = new URLSearchParams();
  if (lessonId) params.set('lesson', lessonId);
  if (resumeId) params.set('resumeId', resumeId);
  if (query) params.set('q', query);
  return `/dashboard/learning${params.size ? `?${params}` : ''}`;
}
export function scopeLearningHref(href: string | undefined, resumeId?: string) {
  if (href && /^https?:\/\//i.test(href)) {
    try {
      const source = new URL(href);
      if (
        ['xueai.app', 'xueai.miyang.cn', 'alice.miyang.cn'].includes(
          source.hostname,
        )
      ) {
        const file = decodeURIComponent(
          source.hash
            ? source.hash.slice(1)
            : (source.pathname.split('/').pop() ?? ''),
        ).replace(/\.html$/, '');
        href = knownLessons.has(file)
          ? learningHref(file)
          : '/dashboard/learning?view=courses';
      }
    } catch {
      /* The Markdown renderer handles malformed external URLs. */
    }
  }
  if (
    !href?.startsWith('/dashboard/learning') ||
    href.split(/[?#]/)[0] !== '/dashboard/learning'
  )
    return href;
  const url = new URL(href, 'https://local.invalid');
  if (resumeId) url.searchParams.set('resumeId', resumeId);
  return `${url.pathname}${url.search}${url.hash}`;
}
