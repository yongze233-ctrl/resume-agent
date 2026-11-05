export type ResourceView =
  'courses' | 'paths' | 'practice' | 'skills' | 'records' | 'jobs';
export interface ResourceTarget {
  view: ResourceView;
  lessonId?: string;
  query?: string;
  job?: { url: string; title: string };
}
const views = new Set([
  'courses',
  'paths',
  'practice',
  'skills',
  'records',
  'jobs',
]);

export function learningTarget(href: string): ResourceTarget | null {
  try {
    const url = new URL(href, 'https://workspace.invalid');
    if (
      url.origin !== 'https://workspace.invalid' ||
      url.pathname !== '/dashboard/learning'
    )
      return null;
    const lessonId = url.searchParams.get('lesson') || undefined;
    if (lessonId && !/^[a-zA-Z0-9][\w.-]{0,149}$/.test(lessonId)) return null;
    const view = url.searchParams.get('view');
    return {
      view: views.has(view ?? '') ? (view as ResourceView) : 'courses',
      lessonId,
      query: url.searchParams.get('q')?.slice(0, 300) || undefined,
    };
  } catch {
    return null;
  }
}

/** Only the employer sources we actually support become in-product job details. */
export function jobTarget(href: string, title: string): ResourceTarget | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const tencent =
      url.hostname === 'careers.tencent.com' &&
      url.pathname === '/jobdesc.html' &&
      /^\d+$/.test(url.searchParams.get('postId') ?? '');
    const ashby =
      url.hostname === 'jobs.ashbyhq.com' &&
      /^\/openai\/[\w-]+\/?$/.test(url.pathname);
    const greenhouse =
      ['job-boards.greenhouse.io', 'boards.greenhouse.io'].includes(
        url.hostname,
      ) && /^\/anthropic\/jobs\/\d+\/?$/.test(url.pathname);
    if (!tencent && !ashby && !greenhouse) return null;
    const id = url.searchParams.get('postId');
    url.search = '';
    url.hash = '';
    if (tencent) url.searchParams.set('postId', id!);
    return {
      view: 'jobs',
      job: {
        url: url.toString(),
        title: title.trim().slice(0, 200) || '岗位详情',
      },
    };
  } catch {
    return null;
  }
}
