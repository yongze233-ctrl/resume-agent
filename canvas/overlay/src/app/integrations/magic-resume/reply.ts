type RequestIdentity = { channel: string; id: string }

/** A tool can return a function or native node proxy which postMessage cannot clone.
 * Always settle the host request instead of leaving it to expire as a canvas timeout. */
export function replyWithCanvasResult(
  post: (message: unknown) => void,
  request: RequestIdentity,
  result: unknown
): void {
  const identity = { type: 'magic-resume:result', channel: request.channel, id: request.id }
  try {
    post({ ...identity, ok: true, result })
  } catch {
    post({
      ...identity,
      ok: false,
      error:
        '画布操作结果无法传输。请直接执行代码并返回普通数据（例如节点 id、坐标），不要返回函数或原生节点对象。如果使用 async 函数，请调用并 await 它；先检查已完成的修改，避免重复创建。'
    })
  }
}
