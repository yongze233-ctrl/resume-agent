'use client';

import { useEffect } from 'react';
import { installFrontendReporting } from '@/lib/diagnostics/frontend';

/**
 * `window.onerror` 与 `unhandledrejection` 的汇聚点。
 *
 * 这两个此前**一个都没有挂**。React 边界只接得住渲染期的崩溃；事件回调里抛的异常、
 * 没有 `.catch()` 的 promise、第三方脚本的报错，全部只在用户自己的控制台里闪一下——
 * 也就是说，最难复现的那类故障，恰好是我们唯一收不到的那类。
 *
 * 只上报，不弹提示：到得了这里的东西通常已经有别的地方在处理，再弹一层只会重复打扰。
 */
export function GlobalErrorListener() {
  useEffect(installFrontendReporting, []);

  return null;
}
