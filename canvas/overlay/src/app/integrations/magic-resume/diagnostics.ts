/** Forward code locations to the same-origin host; never send error messages or document state. */
export function reportResumeCanvasError(error: unknown, fallback = ''): void {
  if (import.meta.env.VITE_RESUME_HOSTED !== 'true' || parent === window) return
  const channel = new URLSearchParams(location.search).get('magic_resume')
  if (!channel || !/^[a-f0-9-]{36}$/.test(channel)) return
  try {
    if (new URL(document.referrer).origin !== location.origin) return
    const name = error instanceof Error ? error.name : 'Error'
    const stack = error instanceof Error ? (error.stack ?? fallback) : fallback
    parent.postMessage(
      {
        type: 'magic-resume:diagnostic',
        channel,
        diagnostic: { name, stack: stack.slice(0, 3000) }
      },
      location.origin
    )
  } catch {
    console.warn('Resume diagnostics forwarding unavailable')
  }
}

export function installResumeCanvasDiagnostics(): void {
  if (import.meta.env.VITE_RESUME_HOSTED !== 'true') return
  window.addEventListener('error', (event) => {
    reportResumeCanvasError(event.error, `${event.filename}:${event.lineno}:${event.colno}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof Error && event.reason.name === 'AbortError') return
    reportResumeCanvasError(event.reason)
  })
}
