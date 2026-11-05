import type { SceneGraph } from '@open-pencil/scene-graph'
import {
  byCreatedAt,
  commentPosition,
  liveReplies,
  readComments
} from '@open-pencil/scene-graph/comments'

/** Project the document's native comment store, rather than looking for comment layers. */
export function canvasComments(graph: SceneGraph, pageId: string) {
  const visible = readComments(graph)
    .filter((thread) => !thread.deleted && thread.pageId === pageId)
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || byCreatedAt(a, b))
  const textNodes: Array<{
    id: string
    text: string
    x: number
    y: number
    width: number
    height: number
  }> = []
  const visit = (id: string) => {
    const node = graph.getNode(id)
    if (!node || !node.visible) return
    if (node.type === 'TEXT' && node.text.trim()) {
      textNodes.push({
        id,
        text: node.text,
        ...graph.getAbsolutePosition(id),
        width: node.width,
        height: node.height
      })
    }
    for (const child of node.childIds) visit(child)
  }
  visit(pageId)
  let budget = 18000
  let truncated = visible.length > 30
  const clip = (text: string, limit: number) => {
    const value = text.slice(0, Math.max(0, Math.min(limit, budget)))
    budget -= value.length
    if (value.length < text.length) truncated = true
    return value
  }
  const threads = visible.slice(0, 30).flatMap((thread) => {
    if (budget <= 0) {
      truncated = true
      return []
    }
    const position = commentPosition(graph, thread)
    const distance = (node: (typeof textNodes)[number]) =>
      Math.hypot(
        Math.max(node.x - position.x, 0, position.x - node.x - node.width),
        Math.max(node.y - position.y, 0, position.y - node.y - node.height)
      )
    const replies = liveReplies(thread)
    if (replies.length > 5) truncated = true
    return [
      {
        id: thread.id,
        text: clip(thread.text, 3000),
        author: clip(thread.author, 100),
        resolved: thread.resolved,
        pageId: thread.pageId,
        nodeId: thread.nodeId,
        nodeName: (thread.nodeId
          ? (graph.getNode(thread.nodeId)?.name ?? thread.nodeName)
          : thread.nodeName)?.slice(0, 1000),
        position,
        replies: replies
          .slice(-5)
          .map((reply) => ({
            id: reply.id,
            text: clip(reply.text, 1500),
            author: clip(reply.author, 100)
          })),
        nearbyText: [...textNodes]
          .sort((a, b) => distance(a) - distance(b))
          .slice(0, 3)
          .map((node) => ({ id: node.id, text: clip(node.text, 500) }))
      }
    ]
  })
  return { status: 'ready' as const, pageId, total: visible.length, truncated, threads }
}
