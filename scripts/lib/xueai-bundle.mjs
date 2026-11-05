import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, relative, dirname } from 'node:path';
import { parse, serialize, parseFragment } from 'parse5';

const walk = (node, fn) => {
  fn(node);
  for (const child of [...(node.childNodes ?? [])]) walk(child, fn);
};
const attr = (node, key) =>
  node.attrs?.find((item) => item.name === key)?.value;
const setAttr = (node, name, value) => {
  node.attrs ??= [];
  node.attrs = node.attrs.filter((item) => item.name !== name);
  node.attrs.push({ name, value });
};
const remove = (node) => {
  if (node.parentNode)
    node.parentNode.childNodes = node.parentNode.childNodes.filter(
      (child) => child !== node,
    );
};
const insertHtml = (node, html, first = false) => {
  const fragment = parseFragment(html);
  fragment.childNodes.forEach((child) => {
    child.parentNode = node;
  });
  node.childNodes = first
    ? [...fragment.childNodes, ...node.childNodes]
    : [...node.childNodes, ...fragment.childNodes];
};
const scriptText = (text) => text.replace(/<\/script/gi, '<\\/script');

// These local helpers have no service calls. The original navigation/auth/AI clients are replaced.
const helpers = new Set([
  'build.js',
  'taste.js',
  'oss-interact.js',
  'oss-calc.js',
  'seo-course.js',
  'skill-data.js',
  'skill-copy.js',
  'qr.js',
]);
const sourceHosts = new Set([
  'xueai.app',
  'xueai.miyang.cn',
  'alice.miyang.cn',
  'miyang.cn',
]);

export async function bundleLessons({ source, lessons, output }) {
  const slides = resolve(source, 'slides');
  const known = new Map(lessons.map((lesson) => [lesson.file, lesson.id]));
  const assets = new Map(),
    usedHelpers = new Set();
  const image = async (value, from = slides) => {
    if (!value || value.startsWith('data:') || value.startsWith('#'))
      return value;
    const key = /^https?:/.test(value)
      ? value
      : resolve(from, value.split(/[?#]/)[0]);
    if (assets.has(key)) return assets.get(key);
    let bytes, extension;
    if (/^https?:/.test(key)) {
      const url = new URL(key);
      if (url.protocol !== 'https:' || url.hostname !== 'img.alice.miyang.cn')
        throw new Error(`Unreviewed image origin: ${key}`);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('image/')
      )
        throw new Error(`Image unavailable: ${key}`);
      bytes = Buffer.from(await response.arrayBuffer());
      extension = response.headers.get('content-type').split(';')[0];
    } else {
      const path = relative(source, key);
      if (path.startsWith('..') || resolve(source, path) !== key)
        throw new Error(`Asset escapes checkout: ${key}`);
      bytes = await readFile(key);
      extension = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
      }[extname(key).toLowerCase()];
      if (!extension) throw new Error(`Unsupported lesson asset: ${key}`);
    }
    if (bytes.length > 12 * 1024 * 1024)
      throw new Error(`Lesson image too large: ${key}`);
    const data = `data:${extension};base64,${bytes.toString('base64')}`;
    assets.set(key, data);
    return data;
  };
  const css = async (text, from) => {
    const refs = [...text.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)];
    for (const ref of refs)
      if (!ref[2].startsWith('data:') && !ref[2].startsWith('#'))
        text = text.replace(ref[0], `url("${await image(ref[2], from)}")`);
    return text;
  };
  const contents = {};
  for (const lesson of lessons) {
    const doc = parse(await readFile(resolve(slides, lesson.file), 'utf8'));
    const nodes = [];
    walk(doc, (node) => nodes.push(node));
    const head = nodes.find((node) => node.tagName === 'head'),
      body = nodes.find((node) => node.tagName === 'body');
    for (const node of nodes) {
      if (node.tagName === 'script') {
        const src = attr(node, 'src');
        const text = (node.childNodes ?? [])
          .map((child) => child.value ?? '')
          .join('');
        if (src) {
          const file = src.split(/[?#]/)[0];
          if (helpers.has(file)) {
            usedHelpers.add(file);
            const code = await readFile(resolve(slides, file), 'utf8');
            insertHtml(node.parentNode, `<script>${scriptText(code)}</script>`);
            // Preserve script order: move the new script into the original position.
            const added = node.parentNode.childNodes.pop();
            node.parentNode.childNodes.splice(
              node.parentNode.childNodes.indexOf(node),
              0,
              added,
            );
          }
          remove(node);
        } else if (
          /xa_auth|xa-locked/.test(text) ||
          attr(node, 'type') === 'application/ld+json'
        )
          remove(node);
      }
      if (node.tagName === 'link') {
        if (attr(node, 'rel') === 'stylesheet') {
          const file = attr(node, 'href')?.split(/[?#]/)[0];
          if (!file || /^https?:/.test(file) || file.includes('..'))
            throw new Error(`Unreviewed stylesheet: ${file}`);
          insertHtml(
            head,
            `<style>${await css(await readFile(resolve(slides, file), 'utf8'), dirname(resolve(slides, file)))}</style>`,
          );
          const added = head.childNodes.pop();
          const container = node.parentNode;
          added.parentNode = container;
          container.childNodes.splice(
            container.childNodes.indexOf(node),
            0,
            added,
          );
        }
        remove(node);
      }
      if (node.tagName === 'style') {
        for (const child of node.childNodes ?? [])
          if (child.value) child.value = await css(child.value, slides);
      }
      if (
        node.tagName === 'meta' &&
        /refresh|content-security-policy/i.test(attr(node, 'http-equiv') ?? '')
      )
        remove(node);
      if (node.tagName === 'base' || node.tagName === 'iframe') remove(node);
      if (node.tagName === 'img') {
        const src = attr(node, 'src');
        if (src) setAttr(node, 'src', await image(src));
        node.attrs = node.attrs.filter((item) => item.name !== 'srcset');
      }
      if (node.tagName === 'a') {
        const href = attr(node, 'href');
        if (!href || href.startsWith('#')) continue;
        let file = href.split(/[?#]/)[0].split('/').pop();
        if (/^https?:/.test(href)) {
          const url = new URL(href);
          if (!sourceHosts.has(url.hostname)) {
            setAttr(node, 'data-reference', href);
            setAttr(node, 'href', '#reference');
            continue;
          }
          file = url.hash.endsWith('.html')
            ? decodeURIComponent(url.hash.slice(1))
            : file;
        }
        const id = known.get(file);
        if (id) {
          setAttr(
            node,
            'href',
            `/dashboard/learning?lesson=${encodeURIComponent(id)}`,
          );
          setAttr(node, 'data-lesson-id', id);
        } else {
          setAttr(node, 'href', '/dashboard/learning?view=courses');
          setAttr(
            node,
            'data-learning-view',
            /^exam/.test(file)
              ? 'practice'
              : /roadmap/.test(file)
                ? 'paths'
                : 'courses',
          );
        }
        node.attrs = node.attrs.filter((item) => item.name !== 'target');
      }
    }
    // Sandboxed documents get private transient storage, never the resume origin's storage.
    const runtime = `(()=>{const send=(type,data={})=>parent.postMessage({scope:'resume-learning',type,lessonId:${JSON.stringify(lesson.id)},...data},'*');for(const key of ['localStorage','sessionStorage']){const values=new Map();Object.defineProperty(window,key,{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear()},configurable:true});}window.lessonOnView=(el,cb)=>{if(el&&typeof cb==='function'){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();cb();}});io.observe(el);}};document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const raw=a.getAttribute('href')||'';if((raw.startsWith('#')&&!a.dataset.reference)||raw.startsWith('data:')||raw.startsWith('blob:'))return;e.preventDefault();let id=a.dataset.lessonId,view=a.dataset.learningView;if(!id&&!view&&!a.dataset.reference){try{const u=new URL(raw,location.href);if(u.origin===new URL(location.href).origin||['xueai.app','xueai.miyang.cn','alice.miyang.cn'].includes(u.hostname)){id=u.searchParams.get('lesson')||(u.hash.endsWith('.html')?decodeURIComponent(u.hash.slice(1)):u.pathname.split('/').pop().replace(/\\.html$/,''));}else{send('reference',{url:u.href});return;}}catch{return;}}if(a.dataset.reference)send('reference',{url:a.dataset.reference});else send('navigate',{targetLesson:id,view:view||'courses'});},true);window.addEventListener('DOMContentLoaded',()=>{if(typeof SHARE_URL!=='undefined')SHARE_URL=new URL('/dashboard/learning?lesson=${encodeURIComponent(lesson.id)}',location.href).href;document.querySelectorAll('.reveal,.fade-in').forEach(e=>e.classList.add('show'));document.documentElement.classList.remove('xa-locked');document.querySelectorAll('.qr-bar,.xa-watermark,.lesson-nav').forEach(e=>e.remove());document.addEventListener('keydown',e=>{if(e.key==='Escape')send('close');});});})();`;
    insertHtml(
      head,
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><script>${runtime}</script>`,
      true,
    );
    insertHtml(
      head,
      '<style>body{opacity:1!important;animation:none!important;padding:26px!important;background:#fff!important}.reveal,.fade-in{opacity:1!important;transform:none!important}.lesson-nav,.qr-bar,.xa-watermark,.paywall-mask{display:none!important}.paywall-locked{max-height:none!important;mask-image:none!important;pointer-events:auto!important}@media(max-width:600px){body{padding:18px!important}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style>',
    );
    const prose = [];
    const extract = (node) => {
      if (['script', 'style', 'nav'].includes(node.tagName)) return;
      if (node.nodeName === '#text') prose.push(node.value);
      for (const child of node.childNodes ?? []) extract(child);
    };
    extract(body);
    contents[lesson.id] = {
      title: lesson.title,
      topic: lesson.topic,
      text: prose.join(' ').replace(/\s+/g, ' ').trim().slice(0, 18000),
    };
    await writeFile(resolve(output, lesson.file), serialize(doc));
  }
  return { contents, assets: assets.size, helpers: [...usedHelpers] };
}
