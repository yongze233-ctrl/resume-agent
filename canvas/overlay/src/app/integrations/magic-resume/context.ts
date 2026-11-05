import { IS_BROWSER } from '@/constants'

const channel =
  IS_BROWSER && window.parent !== window
    ? new URLSearchParams(window.location.search).get('magic_resume')
    : null

/** The embedding resume workspace provides its own chat beside the canvas. */
export const resumeHostChannel = channel && /^[a-f0-9-]{36}$/.test(channel) ? channel : null
