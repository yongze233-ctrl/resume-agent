import * as v from 'valibot'

import { pinnedAccountId } from '@/app/storage/account-scope'

const sessionSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({ enabled: v.boolean(), user: v.nullable(v.object({ id: v.string() })) })
)

/** Hosted resume caches are mounted only after the account session is verified. */
export async function verifyHostedResumeAccount(): Promise<boolean> {
  if (import.meta.env.VITE_RESUME_HOSTED !== 'true') return true
  const response = await fetch('/api/auth/get-session', {
    cache: 'no-store',
    credentials: 'same-origin'
  })
  if (!response.ok) throw new Error('登录状态暂时无法验证，请稍后刷新。')
  const parsed = v.safeParse(sessionSchema, await response.text())
  if (!parsed.success) throw new Error('登录状态暂时无法验证，请稍后刷新。')
  const result = parsed.output
  if (!result.enabled) return true
  if (!result.user) {
    window.location.replace('/login?next=/dashboard')
    return false
  }
  if (result.user.id !== pinnedAccountId) {
    window.location.reload()
    return false
  }
  return true
}
