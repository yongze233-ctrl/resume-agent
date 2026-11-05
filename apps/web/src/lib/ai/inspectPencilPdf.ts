/** Read the exported bytes, rather than trusting the canvas's export report. */
export async function inspectPencilPdf(base64: string) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = getDocument({ data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)) });
  const document = await task.promise;
  try {
    const texts: string[] = [];
    const pages: Array<{ width: number; height: number }> = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height });
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => 'str' in item ? item.str : '').join(''));
    }
    return { pdfText: texts.join('\n'), pages };
  } finally { void task.destroy(); }
}
