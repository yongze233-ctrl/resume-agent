import { chromium, type Browser } from 'playwright';
import { identityContext } from '../auth/context.js';
import type { DesignArtifact } from './artifacts.js';

let browser: Promise<Browser> | undefined;
export async function renderDesign(artifact: DesignArtifact, signal: AbortSignal) {
  signal.throwIfAborted();
  browser ??= chromium.launch({ headless: true }).catch((error) => { browser = undefined; throw error; });
  const page = await (await browser).newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 1 });
  const abort = () => { void page.close().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const webUrl = process.env.AGENT_DESIGN_WEB_URL || 'http://127.0.0.1:3000';
    const ticket = identityContext.getStore()?.renderTicket(artifact.id);
    await page.goto(`${webUrl}/design-render/${artifact.id}${ticket ? `?renderToken=${encodeURIComponent(ticket)}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => { const state = window as unknown as { designRenderReady?: boolean; designRenderError?: string }; return state.designRenderReady || state.designRenderError; }, undefined, { timeout: 45000 });
    const pdf = await page.evaluate(() => {
      const state = window as unknown as { designRenderError?: string; designPdfMetrics: { pages: number; width: number; height: number; text: string; punctuationIssues: number } };
      if (state.designRenderError) throw new Error(state.designRenderError);
      return state.designPdfMetrics;
    });
    await page.evaluate(() => document.fonts.ready);
    // Development chrome must never become part of a document review image.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const metrics = await page.locator('#design-content').evaluate((root) => {
      const rectangle = root.getBoundingClientRect();
      return { height: Math.ceil(rectangle.height), width: Math.ceil(rectangle.width), text: (root as HTMLElement).innerText, horizontalOverflow: root.scrollWidth > 796 };
    });
    const image = await page.locator('#design-pdf').screenshot({ type: 'png', timeout: 20000 });
    const a4 = Math.abs(pdf.width - 595.28) < 1 && Math.abs(pdf.height - 841.89) < 1;
    return { image, height: metrics.height, pages: pdf.pages, overflow: pdf.pages > 1 || !a4 || metrics.height > 1123 || metrics.horizontalOverflow, text: pdf.text, punctuationIssues: pdf.punctuationIssues };
  } finally {
    signal.removeEventListener('abort', abort);
    await page.close().catch(() => undefined);
  }
}
