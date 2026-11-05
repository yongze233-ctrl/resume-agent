import { useSessionStorage } from '@vueuse/core'
import { fromUint8Array, toUint8Array, isValid } from 'js-base64'
import * as v from 'valibot'

import { getPageBackgrounds, setPageBackgrounds } from '@open-pencil/core/figma-api'
import { exportPDFDocument } from '@open-pencil/core/io/formats/pdf'
import { fontManager } from '@open-pencil/core/text'

import { makeFigmaFromStore } from '@/app/automation/bridge/figma-factory'
import { createAutomationCommandHandlers } from '@/app/automation/bridge/handlers'
import { useComments } from '@/app/comments/use'
import { ensureGraphFonts } from '@/app/editor/fonts'
import { setAppThemeOverride } from '@/app/shell/theme'
import { accountStorageKey } from '@/app/storage/account-scope'
import { createTab, getTabById, switchTab } from '@/app/tabs'

import { canvasComments } from './comments'
import { resumeHostChannel } from './context'
import { replyWithCanvasResult } from './reply'
import { syncResumeReview } from './review'

const origins = new Set([location.origin, 'http://127.0.0.1:3000', 'http://localhost:3000'])
const requestSchema = v.object({
  type: v.literal('magic-resume:request'),
  channel: v.string(),
  id: v.string(),
  operation: v.picklist([
    'call',
    'inspect',
    'comments',
    'bundle',
    'snapshot',
    'restore',
    'panels',
    'review',
    'review-catalog',
    'review-focus',
    'review-source'
  ]),
  command: v.optional(v.picklist(['eval', 'export', 'undo', 'redo'])),
  args: v.optional(v.record(v.string(), v.unknown())),
  frameId: v.optional(v.string()),
  fig: v.optional(v.string())
})

/** Local, explicit embedding adapter. Credentials never enter the canvas. */
export async function installMagicResumeBridge(): Promise<void> {
  const channel = resumeHostChannel
  if (!channel) return
  setAppThemeOverride('light')
  window.dispatchEvent(new Event('magic-resume:replace-bridge'))
  const listeners = new AbortController()
  window.addEventListener('magic-resume:replace-bridge', () => listeners.abort(), {
    once: true,
    signal: listeners.signal
  })
  const instanceId = `${performance.timeOrigin}:${performance.now()}`
  const storageKey = accountStorageKey(`magic-resume-tab:${channel}`)
  const remembered = useSessionStorage<string | null>(storageKey, null, { writeDefaults: false })
  const tab = (remembered.value ? getTabById(remembered.value) : undefined) ?? createTab()
  remembered.value = tab.id
  switchTab(tab.id)
  let store = tab.store
  function matchWorkspaceBackground() {
    const page = store.graph.getNode(store.state.currentPageId)
    if (!page) return
    const value = 244 / 255
    const paints = getPageBackgrounds(page)
    const paint = paints[0]
    if (
      paints.length === 1 &&
      paint?.type === 'SOLID' &&
      paint.visible &&
      paint.opacity === 1 &&
      paint.color.r === value &&
      paint.color.g === value &&
      paint.color.b === value &&
      paint.color.a === 1
    )
      return
    setPageBackgrounds(store.graph, page, [
      { type: 'SOLID', color: { r: value, g: value, b: value, a: 1 }, opacity: 1, visible: true }
    ])
  }
  matchWorkspaceBackground()
  store.state.documentName = '简历设计'
  store.state.showUI = false
  store.designCheck.setMarkersAllowed(false)
  const { handleTargetCommand } = createAutomationCommandHandlers(makeFigmaFromStore)
  const completed = new Map<string, Promise<unknown>>()
  await store.canvasReady
  await Promise.all(
    [
      { family: 'Noto Sans SC', file: 'NotoSansSC.ttf', styles: ['Regular', 'Bold'] },
      { family: 'Noto Serif SC', file: 'NotoSerifSC-Regular.ttf', styles: ['Regular'] },
      { family: 'Noto Serif SC', file: 'NotoSerifSC-Bold.ttf', styles: ['Bold'] }
    ].map(async ({ family, file, styles }) => {
      const response = await fetch(`${import.meta.env.BASE_URL}resume-fonts/${file}?v=20261103`)
      if (!response.ok) throw new Error('中文字体加载失败')
      const data = await response.arrayBuffer()
      await Promise.all(styles.map((style) => fontManager.markLoaded(family, style, data)))
    })
  )

  function inspect(frameId?: string) {
    const root = frameId
      ? store.graph.getNode(frameId)
      : store.graph.getNode(store.state.currentPageId)
    if (!root) throw new Error('画布节点不存在')
    const nodes: Array<{
      id: string
      name: string
      type: string
      x: number
      y: number
      width: number
      height: number
      text?: string
    }> = []
    const visit = (id: string, parentX: number, parentY: number) => {
      const node = store.graph.getNode(id)
      if (!node || node.visible === false || nodes.length >= 1500) return
      const x = parentX + node.x
      const y = parentY + node.y
      nodes.push({
        id,
        name: node.name,
        type: node.type,
        x,
        y,
        width: node.width,
        height: node.height,
        ...(node.type === 'TEXT' ? { text: node.text } : {})
      })
      for (const child of node.childIds) visit(child, x, y)
    }
    visit(root.id, -root.x, -root.y)
    return {
      rootId: root.id,
      width: root.width,
      height: root.height,
      comments: canvasComments(store.graph, store.state.currentPageId),
      nodes
    }
  }

  function resumeFrame(frameId?: string) {
    const requested = frameId ? store.graph.getNode(frameId) : undefined
    if (frameId) return requested?.type === 'FRAME' ? requested : undefined
    const frames = store.graph
      .getChildren(store.state.currentPageId)
      .filter((node) => node.type === 'FRAME')
    const a4 = frames.filter(
      (node) => Math.abs(node.width - 595.28) < 1 && Math.abs(node.height - 841.89) < 1
    )
    if (a4.length === 1) return a4[0]
    if (!frameId && frames.length === 1) return frames[0]
    return undefined
  }

  async function snapshot(frameId?: string) {
    let fig = ''
    await store.saveFigFileCopy(async (bytes) => {
      fig = fromUint8Array(bytes)
    })
    const resolvedFrameId = resumeFrame(frameId)?.id
    return { fig, frameId: resolvedFrameId, inspection: inspect(resolvedFrameId) }
  }

  function reviewCatalog() {
    const frames: Array<{
      id: string
      name: string
      pageId: string
      pageName: string
      width: number
      height: number
      textCount: number
    }> = []
    const textCount = (id: string): number => {
      const node = store.graph.getNode(id)
      if (!node || !node.visible) return 0
      return (
        (node.type === 'TEXT' && node.text.trim() ? 1 : 0) +
        node.childIds.reduce((sum, child) => sum + textCount(child), 0)
      )
    }
    const visit = (id: string, pageId: string, pageName: string) => {
      const node = store.graph.getNode(id)
      if (!node || !node.visible || frames.length >= 40) return
      if (
        node.type === 'FRAME' &&
        node.width >= 200 &&
        node.height >= 300 &&
        node.width <= node.height * 0.9 &&
        node.width >= node.height * 0.5
      ) {
        const count = textCount(id)
        if (count > 0)
          frames.push({
            id,
            name: node.name,
            pageId,
            pageName,
            width: node.width,
            height: node.height,
            textCount: count
          })
        return
      }
      for (const child of store.graph.getChildren(node.id).sort((a, b) => a.y - b.y || a.x - b.x))
        visit(child.id, pageId, pageName)
    }
    for (const page of store.graph.getPages()) {
      for (const child of store.graph.getChildren(page.id).sort((a, b) => a.y - b.y || a.x - b.x))
        visit(child.id, page.id, page.name)
    }
    return { frames }
  }

  async function focusReviewFrame(frameId?: string) {
    const frames = reviewCatalog().frames
    let target = frames.find((frame) => frame.id === frameId)
    if (!frameId && frames.length === 1) target = frames[0]
    if (!target)
      throw new Error(
        frameId ? '这份简历画板已不存在，请刷新画板列表' : '画布中有多份简历，请明确选择评估对象'
      )
    if (store.state.currentPageId !== target.pageId) await store.switchPage(target.pageId)
    store.select([target.id])
    store.zoomToSelection()
    store.select([])
    await settleCanvas()
    return target
  }

  async function readReviewSource(frameId?: string) {
    const target = await focusReviewFrame(frameId)
    return {
      ...inspect(target.id),
      frameId: target.id,
      frameName: target.name,
      pageId: target.pageId
    }
  }

  async function annotateReview(request: v.InferOutput<typeof requestSchema>) {
    if (request.args?.enabled === false)
      return syncResumeReview(
        store.graph,
        store.state.currentPageId,
        request.frameId ?? '',
        request.args
      )
    const target = reviewCatalog().frames.find((frame) => frame.id === request.frameId)
    if (!target) throw new Error('未找到本次评估的简历画板，请重新选择评估对象')
    const result = syncResumeReview(store.graph, target.pageId, target.id, request.args)
    if (request.args?.enabled) {
      const comments = useComments()
      if (!comments.showOnCanvas.value) comments.toggleOnCanvas()
      if (result.activeThreadId) await comments.focusThread(result.activeThreadId)
    }
    return result
  }

  async function execute(request: v.InferOutput<typeof requestSchema>): Promise<unknown> {
    const current = getTabById(tab.id)
    if (!current) throw new Error('设计文档已关闭，请重新打开画布')
    store = current.store
    switchTab(tab.id)
    store.designCheck.setMarkersAllowed(false)
    const page = store.graph.getNode(store.state.currentPageId)
    if (!page) throw new Error('当前设计页面不存在')
    const target = {
      store,
      documentId: tab.id,
      documentName: store.state.documentName,
      pageId: page.id,
      pageName: page.name
    }
    if (request.operation === 'panels') {
      store.state.showUI = !store.state.showUI
      return { visible: store.state.showUI }
    }
    if (request.operation === 'restore') {
      if (!request.fig || !isValid(request.fig)) throw new Error('设计源文件格式无效')
      await store.openFigFile(new File([new Uint8Array(toUint8Array(request.fig))], '简历设计.fig'))
      matchWorkspaceBackground()
      store.state.showUI = false
      store.designCheck.setMarkersAllowed(false)
      await ensureGraphFonts(
        store.graph,
        store.graph.getChildren(store.state.currentPageId).map((node) => node.id),
        store.renderer
      )
      store.zoomToFit()
      await settleCanvas()
      return inspect()
    }
    if (request.operation === 'snapshot') return snapshot(request.frameId)
    if (request.operation === 'comments')
      return canvasComments(store.graph, store.state.currentPageId)
    if (request.operation === 'inspect') return inspect(request.frameId)
    const reviewReaders: Partial<
      Record<v.InferOutput<typeof requestSchema>['operation'], () => unknown>
    > = {
      'review-catalog': async () => {
        await settleCanvas()
        return reviewCatalog()
      },
      'review-focus': () => focusReviewFrame(request.frameId),
      'review-source': () => readReviewSource(request.frameId)
    }
    const readReview = reviewReaders[request.operation]
    if (readReview) return readReview()
    if (request.operation === 'review') return annotateReview(request)
    if (request.operation === 'bundle') {
      const node = resumeFrame(request.frameId)
      if (!node) throw new Error('未定位到唯一的简历画板，请选择当前 A4 页面后重试')
      const requestedIds = request.args?.frameIds
      const nodes =
        Array.isArray(requestedIds) && requestedIds.length > 0
          ? requestedIds.slice(0, 3).map((id) => resumeFrame(String(id)))
          : [node]
      const frameIds = nodes.map((item) => {
        if (!item) throw new Error('简历页面不存在')
        return item.id
      })
      await ensureGraphFonts(store.graph, frameIds, store.renderer)
      const pdf = await exportPDFDocument(
        store.graph,
        frameIds.map((id) => ({ pageId: store.state.currentPageId, nodeIds: [id] })),
        { embedFonts: true, title: store.state.documentName }
      )
      if (!pdf) throw new Error('PDF 导出结果为空')
      const source = await snapshot(node.id)
      const images = []
      for (const id of frameIds)
        images.push(
          await handleTargetCommand(target, 'export', {
            nodeIds: [id],
            scale: 1.25,
            format: 'PNG'
          })
        )
      return {
        pdf: fromUint8Array(pdf.data),
        fig: source.fig,
        frameId: node.id,
        frameIds,
        image: images[0],
        images,
        pages: pdf.pages,
        fonts: pdf.fonts,
        inspection: inspect(node.id),
        inspections: frameIds.map((id) => inspect(id))
      }
    }
    if (!request.command) throw new Error('缺少画布操作')
    const result = await handleTargetCommand(target, request.command, {
      ...request.args
    })
    matchWorkspaceBackground()
    store.zoomToFit()
    await settleCanvas()
    return result
  }

  // Let progressive scene tiles paint before acknowledging an edit. Otherwise
  // the next snapshot/job can start while only part of the white paper is visible.
  async function settleCanvas() {
    const deadline = performance.now() + 5000
    const visibleTilesPending = () =>
      store.canvasRenderers
        .filter((renderer) => renderer.tracksSceneSettlement && renderer.pageId !== null)
        .some((renderer) => !renderer.tiledSceneCovered || renderer.tiledScenePending)
    do {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 32)
      })
    } while (visibleTilesPending() && performance.now() < deadline)
  }

  window.addEventListener(
    'message',
    (event: MessageEvent<unknown>) => {
      if (event.source !== parent || !origins.has(event.origin)) return
      const parsed = v.safeParse(requestSchema, event.data)
      if (!parsed.success || parsed.output.channel !== channel) return
      const request = parsed.output
      let running = completed.get(request.id)
      if (!running) {
        if (completed.size >= 64) {
          const oldest = completed.keys().next().value
          if (oldest) completed.delete(oldest)
        }
        running = execute(request)
        completed.set(request.id, running)
      }
      void running.then(
        (result) =>
          replyWithCanvasResult((message) => parent.postMessage(message, event.origin), request, result),
        (error: unknown) =>
          parent.postMessage(
            {
              type: 'magic-resume:result',
              channel,
              id: request.id,
              ok: false,
              error: error instanceof Error ? error.message.slice(0, 400) : 'OpenPencil 操作失败'
            },
            event.origin
          )
      )
    },
    { signal: listeners.signal }
  )
  // The parent repeats hello after a reload; no mutation is repeated.
  window.addEventListener(
    'message',
    (event: MessageEvent<unknown>) => {
      if (event.source !== parent || !origins.has(event.origin)) return
      const value = event.data
      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'magic-resume:hello'
      )
        parent.postMessage({ type: 'magic-resume:ready', channel, instanceId }, event.origin)
    },
    { signal: listeners.signal }
  )
  if (!listeners.signal.aborted)
    for (const origin of origins)
      parent.postMessage({ type: 'magic-resume:ready', channel, instanceId }, origin)
}
