import { compact } from 'es-toolkit'
import * as v from 'valibot'
import { shallowRef } from 'vue'

import type { SceneGraph } from '@open-pencil/scene-graph'
import {
  createCommentThread,
  readComments,
  resolveCommentThread,
  writeComments,
  commentTimestamp
} from '@open-pencil/scene-graph/comments'
import type { Color } from '@open-pencil/scene-graph/primitives'

const reviewRequestSchema = v.object({
  enabled: v.boolean(),
  scanning: v.optional(v.boolean(), false),
  showHighlights: v.optional(v.boolean(), true),
  reviewKey: v.pipe(v.string(), v.maxLength(80)),
  activeIssueId: v.optional(v.nullable(v.string())),
  issues: v.pipe(
    v.array(
      v.object({
        id: v.pipe(v.string(), v.maxLength(100)),
        problem: v.pipe(v.string(), v.maxLength(3000)),
        suggestion: v.optional(v.string()),
        missingEvidence: v.optional(v.array(v.string())),
        severity: v.optional(v.string()),
        evidence: v.array(v.object({ itemId: v.string(), quote: v.string() }))
      })
    ),
    v.maxLength(30)
  )
})
export interface ResumeReviewMark {
  issueId: string
  threadId: string
  nodeId: string
  pageLevel: boolean
  index: number
}
export const resumeReviewLayer = shallowRef<{
  enabled: boolean
  scanning: boolean
  rootId: string
  pageId: string
  frameId: string
  marks: ResumeReviewMark[]
}>({ enabled: false, scanning: false, rootId: '', pageId: '', frameId: '', marks: [] })
const plain = (text: string) =>
  text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const authorColor: Color = { r: 0.267, g: 0.463, b: 0.824, a: 1 }

/** Create native comment threads only. Resume text, page geometry and user comments stay intact. */
export function syncResumeReview(
  graph: SceneGraph,
  pageId: string,
  frameId: string,
  value: unknown
) {
  const input = v.parse(reviewRequestSchema, value)
  if (!input.enabled) {
    resumeReviewLayer.value = { ...resumeReviewLayer.value, enabled: false, scanning: false }
    return { mapped: 0, pageLevel: 0, activeThreadId: null }
  }
  const frame = graph.getNode(frameId)
  if (!frame || frame.type !== 'FRAME') throw new Error('请选择当前简历画板后重试')
  const nodes: string[] = []
  const visit = (id: string) => {
    const node = graph.getNode(id)
    if (!node || !node.visible) return
    if (node.type === 'TEXT' && node.text.trim()) nodes.push(id)
    for (const child of node.childIds) visit(child)
  }
  visit(frameId)
  const prefix = `resume-review:${input.reviewKey.slice(0, 48)}:`
  let comments = readComments(graph)
  let changed = false
  const now = commentTimestamp()
  // Older AI assessments become history, without deleting replies or changing user-authored threads.
  comments = comments.map((thread) => {
    if (
      thread.id.startsWith('resume-review:') &&
      !thread.id.startsWith(prefix) &&
      (thread.nodeId === frameId || nodes.includes(thread.nodeId ?? '')) &&
      !thread.resolved &&
      !thread.deleted
    ) {
      changed = true
      return resolveCommentThread(thread, true, now)
    }
    return thread
  })
  const marks: ResumeReviewMark[] = []
  input.issues.forEach((issue, index) => {
    let match: string | undefined
    for (const evidence of issue.evidence) {
      const quote = plain(evidence.quote)
      if (quote.length < 4) continue
      const exact = nodes.find(
        (id) => id === evidence.itemId && plain(graph.getNode(id)?.text ?? '').includes(quote)
      )
      match = exact ?? nodes.find((id) => plain(graph.getNode(id)?.text ?? '').includes(quote))
      if (match) break
    }
    const node = graph.getNode(match ?? frameId)
    if (!node) return
    const threadId = `${prefix}${issue.id.slice(0, 60)}`
    const existing = comments.find((thread) => thread.id === threadId)
    if (existing?.deleted || existing?.resolved) return
    const at = graph.getAbsolutePosition(node.id)
    const point = match
      ? { x: at.x + Math.max(1, node.width - 4), y: at.y + Math.min(5, node.height / 2) }
      : { x: at.x + node.width - 16, y: at.y + 22 + index * 26 }
    const body = compact([
      match ? issue.problem : `整页建议（具体位置待确认）：${issue.problem}`,
      issue.suggestion ? `建议：${issue.suggestion}` : '',
      issue.missingEvidence?.length ? `需要核实：${issue.missingEvidence.join('；')}` : ''
    ])
      .join('\n\n')
      .slice(0, 3000)
    if (!existing) {
      const created = createCommentThread(graph, {
        pageId,
        at: point,
        author: { name: '简历评估', color: authorColor },
        text: body,
        now
      })
      comments.push({
        ...created,
        id: threadId,
        nodeId: node.id,
        nodeName: node.name,
        offsetX: point.x - at.x,
        offsetY: point.y - at.y
      })
      changed = true
    } else if (existing.text !== body) {
      comments = comments.map((thread) =>
        thread.id === threadId ? { ...thread, text: body, updatedAt: now } : thread
      )
      changed = true
    }
    marks.push({ issueId: issue.id, threadId, nodeId: node.id, pageLevel: !match, index })
  })
  if (changed) writeComments(graph, comments)
  resumeReviewLayer.value = {
    enabled: input.showHighlights,
    scanning: input.scanning,
    rootId: graph.rootId,
    pageId,
    frameId,
    marks
  }
  return {
    mapped: marks.length,
    pageLevel: marks.filter((mark) => mark.pageLevel).length,
    activeThreadId: marks.find((mark) => mark.issueId === input.activeIssueId)?.threadId ?? null
  }
}
