/** A public account ID selects local caches; server permissions use a separate HttpOnly session. */
function accountId(): string | null {
  if (typeof document === 'undefined') return null
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('resume_user_id='))
    ?.slice('resume_user_id='.length)
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null
}
export const pinnedAccountId = accountId()
const scope = pinnedAccountId ? `resume-account:${pinnedAccountId}:` : ''
export const accountStorageKey = (key: string): string => `${scope}${key}`
export function accountBrowserStorage(storage: Storage): Storage {
  if (!scope) return storage
  const keys = () =>
    Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => !!key && key.startsWith(scope)
    )
  return {
    get length() {
      return keys().length
    },
    key(index) {
      return keys()[index]?.slice(scope.length) ?? null
    },
    getItem(key) {
      return storage.getItem(accountStorageKey(key))
    },
    setItem(key, value) {
      storage.setItem(accountStorageKey(key), value)
    },
    removeItem(key) {
      storage.removeItem(accountStorageKey(key))
    },
    clear() {
      for (const key of keys()) storage.removeItem(key)
    }
  }
}
