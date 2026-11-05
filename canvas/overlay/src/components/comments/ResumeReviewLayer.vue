<script setup lang="ts">
import { computed } from 'vue'

import type { ViewportTransform } from '@open-pencil/core/geometry'

import { useComments } from '@/app/comments/use'
import { useEditorStore } from '@/app/editor/active-store'
import { resumeReviewLayer } from '@/app/integrations/magic-resume/review'

const { canvasEl, drawn = null } = defineProps<{
  canvasEl: HTMLCanvasElement | null
  drawn?: ViewportTransform | null
}>()
const store = useEditorStore()
const comments = useComments()
const scanRect = computed(() => {
  const layer = resumeReviewLayer.value
  if (
    !layer.enabled ||
    !layer.scanning ||
    layer.rootId !== store.graph.rootId ||
    layer.pageId !== store.state.currentPageId
  )
    return null
  const frame = store.graph.getNode(layer.frameId)
  if (!frame) return null
  const at = store.graph.getAbsolutePosition(frame.id),
    view = drawn ?? store.state
  return {
    left: `${at.x * view.zoom + view.panX}px`,
    top: `${at.y * view.zoom + view.panY}px`,
    width: `${frame.width * view.zoom}px`,
    height: `${frame.height * view.zoom}px`
  }
})
const marks = computed(() => {
  void store.state.sceneVersion
  const layer = resumeReviewLayer.value
  if (
    !layer.enabled ||
    layer.rootId !== store.graph.rootId ||
    layer.pageId !== store.state.currentPageId
  )
    return []
  const view = drawn ?? store.state
  return layer.marks
    .filter(
      (mark) =>
        !mark.pageLevel &&
        comments.threads.value.some(
          (thread) => thread.id === mark.threadId && !thread.resolved && !thread.deleted
        )
    )
    .flatMap((mark) => {
      const node = store.graph.getNode(mark.nodeId)
      if (!node) return []
      const at = store.graph.getAbsolutePosition(node.id)
      return [
        {
          ...mark,
          style: {
            left: `${at.x * view.zoom + view.panX - 3}px`,
            top: `${at.y * view.zoom + view.panY - 3}px`,
            width: `${Math.max(16, node.width * view.zoom + 6)}px`,
            height: `${Math.max(14, node.height * view.zoom + 6)}px`
          }
        }
      ]
    })
})
function wheel(event: WheelEvent) {
  if (!canvasEl) return
  event.preventDefault()
  canvasEl.dispatchEvent(new WheelEvent('wheel', event))
}
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 overflow-hidden"
    data-canvas-overlay="resume-review"
  >
    <div
      v-if="scanRect"
      class="absolute overflow-hidden"
      :style="scanRect"
      aria-hidden="true"
      data-review-scanning
    >
      <div class="absolute inset-x-0 h-full" data-review-scan-band />
    </div>
    <button
      v-for="mark in marks"
      :key="mark.issueId"
      type="button"
      class="pointer-events-auto absolute rounded border border-warning-border bg-warning-bg hover:border-warning hover:bg-warning-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-warning"
      :style="mark.style"
      :aria-label="`查看评估批注 ${mark.index + 1}`"
      :data-review-issue="mark.issueId"
      @click.stop="comments.toggleThread(mark.threadId)"
      @pointerdown.stop
      @wheel="wheel"
    />
  </div>
</template>
