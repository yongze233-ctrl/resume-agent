'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { compile, renderTreeNodeDom, type TemplateDocument } from '@magic-resume-kit/resume-templates';
import type { Resume } from '@/types/frontend/resume';
import { designCandidate } from '@/lib/ai/designCandidate';
import { prepareResumePdfExport } from '@/lib/utils/pdf-export';

type RenderWindow = Window & { designRenderReady?: boolean; designRenderError?: string; designPdfMetrics?: { pages: number; width: number; height: number; text: string; punctuationIssues: number } };

export default function DesignRenderPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ template: TemplateDocument; resume: Resume } | null>(null);
  useEffect(() => {
    let active = true;
    const ticket = new URLSearchParams(location.search).get('renderToken');
    void fetch(`/api/design-artifacts/${encodeURIComponent(id)}`, { cache: 'no-store', headers: ticket ? {'x-resume-render-token':ticket} : undefined }).then((response) => {
      if (!response.ok) throw new Error('Design unavailable');
      return response.json();
    }).then((value) => { if (active) setData(value); }).catch(() => { if (active) (window as RenderWindow).designRenderError = 'Design unavailable'; });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!data) return;
    let active = true;
    void (async () => {
      await document.fonts.ready;
      const blob = await prepareResumePdfExport(designCandidate(data.resume, data.template));
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      const pdf = await task.promise;
      try {
        const page = await pdf.getPage(1);
        const natural = page.getViewport({ scale: 1 });
        const view = page.getViewport({ scale: 794 / natural.width });
        const canvas = document.getElementById('design-pdf') as HTMLCanvasElement;
        canvas.width = Math.ceil(view.width);
        canvas.height = Math.ceil(view.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: view }).promise;
        const texts: string[] = [];
        const lines: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const content = await (await pdf.getPage(i)).getTextContent();
          texts.push(content.items.map((item) => 'str' in item ? item.str : '').join(''));
          let line = '';
          for (const item of content.items) {
            if (!('str' in item)) continue;
            line += item.str;
            if (item.hasEOL) { lines.push(line); line = ''; }
          }
          if (line) lines.push(line);
        }
        if (active) {
          const punctuationIssues = lines.filter((line) => /^[、。，；：？！）》】〉」』”’]/u.test(line.trim())).length;
          (window as RenderWindow).designPdfMetrics = { pages: pdf.numPages, width: natural.width, height: natural.height, text: texts.join('\n'), punctuationIssues };
          (window as RenderWindow).designRenderReady = true;
        }
      } finally { void task.destroy(); }
    })().catch((error: unknown) => { if (active) (window as RenderWindow).designRenderError = error instanceof Error ? error.message : 'PDF render failed'; });
    return () => { active = false; };
  }, [data]);
  const root = data ? compile(data.template, data.resume).root : null;
  return <><canvas id="design-pdf" /><main style={{ background: '#fff', color: '#000', width: 794, minHeight: 1123, fontFamily: '"Source Han Sans SC", sans-serif' }} id="design-canvas"><div id="design-content">{root && renderTreeNodeDom(root)}</div></main></>;
}
