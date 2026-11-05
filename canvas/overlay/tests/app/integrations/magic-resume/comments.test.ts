import { expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'
import {
  createCommentReply,
  createCommentThread,
  readComments,
  writeComments
} from '@open-pencil/scene-graph/comments'

import { canvasComments } from '@/app/integrations/magic-resume/comments'

test('native comments expose current positions, real text targets and live replies without mutations', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const frame = graph.createNode('FRAME', page.id, { x: 100, y: 200, width: 595, height: 842 })
  const text = graph.createNode('TEXT', frame.id, {
    x: 20,
    y: 30,
    width: 200,
    height: 20,
    text: '项目经历'
  })
  const thread = createCommentThread(graph, {
    pageId: page.id,
    at: { x: 125, y: 235 },
    node: text,
    author: { name: '测试用户' },
    text: '这里增加一点留白',
    now: '2026-11-03T00:00:00Z'
  })
  thread.replies = [
    createCommentReply({ name: '测试用户' }, '保留所有文字', thread.createdAt),
    { ...createCommentReply({ name: '测试用户' }, '删除的回复', thread.createdAt), deleted: true }
  ]
  writeComments(graph, [
    thread,
    { ...thread, id: 'resolved', resolved: true },
    { ...thread, id: 'deleted', deleted: true },
    { ...thread, id: 'other-page', pageId: 'another-page' }
  ])
  graph.updateNode(frame.id, { x: 300, y: 400 })
  const before = structuredClone(readComments(graph))
  const result = canvasComments(graph, page.id)
  expect(result.total).toBe(2)
  expect(result.threads[0].text).toBe('这里增加一点留白')
  expect(result.threads[0].position).toEqual({ x: 325, y: 435 })
  expect(result.threads[0].nearbyText[0]).toEqual({ id: text.id, text: '项目经历' })
  expect(result.threads[0].replies.map((reply) => reply.text)).toEqual(['保留所有文字'])
  expect(result.threads[1].resolved).toBe(true)
  expect(readComments(graph)).toEqual(before)
  writeComments(graph, [])
  expect(canvasComments(graph, page.id).threads).toEqual([])
})

test('large comment stores are explicitly bounded instead of silently claiming everything was read', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const thread = createCommentThread(graph, {
    pageId: page.id,
    at: { x: 0, y: 0 },
    author: { name: '测试用户' },
    text: 'a'.repeat(5000),
    now: '2026-11-03T00:00:00Z'
  })
  writeComments(
    graph,
    Array.from({ length: 40 }, (_, index) => ({ ...thread, id: `comment-${index}` }))
  )
  const result = canvasComments(graph, page.id)
  expect(result.total).toBe(40)
  expect(result.truncated).toBe(true)
  expect(JSON.stringify(result).length).toBeLessThan(25000)
})
