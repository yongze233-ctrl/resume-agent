/** This public ID chooses a local database only. The server authorizes the HttpOnly session. */
export function browserAccountId(): string | null {
  if (typeof document === 'undefined') return null;
  const value = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('resume_user_id='))?.slice('resume_user_id='.length);
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
export const AUTH_EVENT_KEY = 'resume-agent:account-change';
export function broadcastAccountChange() {
  try { localStorage.setItem(AUTH_EVENT_KEY,`${Date.now()}:${browserAccountId() ?? 'guest'}`); } catch { /* Cookie validation also runs on window focus. */ }
}
export function loginDestination() {
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}
export function handleAccountExpiry(subCode: unknown) {
  if (subCode === 'user_session_required' && typeof window !== 'undefined' && location.pathname !== '/login') window.location.replace(loginDestination());
}
const errorMessages: Record<string,string> = {
  INVALID_USERNAME_OR_PASSWORD: '账号或密码不正确。',
  INVALID_EMAIL_OR_PASSWORD: '账号或密码不正确。',
  USER_IS_BANNED: '该账号已停用，请联系管理员。',
  USER_BANNED: '该账号已停用，请联系管理员。',
  USERNAME_IS_ALREADY_TAKEN: '这个账号名已经有人使用。',
  USER_ALREADY_EXISTS: '这个账号名已经有人使用。',
  INVALID_PASSWORD: '当前密码不正确。',
  PASSWORD_TOO_SHORT: '密码至少需要 12 位。',
  ADMIN_ACCOUNT_PROTECTED: '管理员账号请通过“修改密码”管理。',
  INVALID_USER_INPUT: '账号名需为 3–30 位字母、数字、下划线或短横线，密码至少 12 位。',
  TOO_MANY_REQUESTS: '尝试次数较多，请稍后再试。',
  FORBIDDEN: '没有执行这项操作的权限。',
};
export async function accountRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : {'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store', credentials:'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessages[data.code] ?? (response.status === 429 ? '尝试次数较多，请稍后再试。' : '操作未完成，请稍后重试。'));
  return data as T;
}
