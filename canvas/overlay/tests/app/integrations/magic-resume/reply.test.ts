import { expect, test } from 'bun:test'

import { replyWithCanvasResult } from '@/app/integrations/magic-resume/reply'

const request = { channel: 'isolated-design', id: 'edit-1' }

test('native edit and binary export results preserve their transport contract', () => {
  const messages: unknown[] = []
  const result = { ok: true, result: { frameId: '1:2', bounds: [0, 0, 595, 842] } }
  replyWithCanvasResult((message) => messages.push(structuredClone(message)), request, result)
  expect(messages).toEqual([{ type: 'magic-resume:result', ...request, ok: true, result }])
})

test('non-cloneable tool results promptly settle the same request with recovery instructions', () => {
  for (const result of [() => {}, { ok: true, result: async () => {} }, new Proxy({}, {})]) {
    const messages: unknown[] = []
    replyWithCanvasResult((message) => messages.push(structuredClone(message)), request, result)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ type: 'magic-resume:result', ...request, ok: false })
    expect(JSON.stringify(messages)).toContain('先检查已完成的修改')
    expect(JSON.stringify(messages)).not.toContain('async ()')
  }
})
