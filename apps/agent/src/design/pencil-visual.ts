/** Native visual primitives shared by skill-driven designs. No resume content is rewritten. */
export const VISUAL_TOOLKIT = String.raw`
const visual = await (async () => {
  for (const style of ['Regular', 'Bold']) await figma.loadFontAsync({family:'Noto Sans SC',style});
  const number = (value,name,fallback) => {
    const result=value===undefined?fallback:value;
    if(typeof result!=='number'||!Number.isFinite(result))throw new Error(name+' must be a finite number. visual.text returns a TextNode, not a height; advance y with visual.bottom(node,gap).');
    return result;
  };
  const positive = (value,name,fallback) => {
    const result=number(value,name,fallback);
    if(result<=0)throw new Error(name+' must be positive');
    return result;
  };
  const position = o => ({x:number(o.x,'x',0),y:number(o.y,'y',0)});
  const bottom = (node,gap=0) => number(node.y,'node.y')+positive(node.height,'node.height')+number(gap,'gap');
  const rgb = (hex) => {
    let h = String(hex || '#20262a').replace(/^#/,'');
    if (/^[0-9a-f]{3}$/i.test(h)) h=h.split('').map(c=>c+c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('Use a three- or six-digit hex color, such as #fff or #ffffff');
    return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};
  };
  const text = (parent, characters, o={}) => {
    const size = positive(o.size,'Text size',9.5);
    if (o.role === 'body' && size < 9) throw new Error('Body text must remain at least 9pt');
    const width=positive(o.width,'Text width');
    const {x,y}=position(o);
    const leading=positive(o.leading,'Text leading',1.35);
    const color=rgb(o.color || '#20262a');
    const n = figma.createText(); parent.appendChild(n);
    n.fontName = {family:'Noto Sans SC',style:o.bold?'Bold':'Regular'};
    n.fontSize = size;
    n.lineHeight = {unit:'PIXELS',value:size*leading};
    n.fills = [{type:'SOLID',color}];
    // Figma-compatible resize fixes a changed height. Enable HEIGHT afterwards.
    n.resize(width,1); n.textAutoResize = 'HEIGHT'; n.characters = String(characters || '');
    n.x = x; n.y = y; n.name = o.name || String(characters).slice(0,36);
    return n;
  };
  const box = (parent,o={}) => {
    const {x,y}=position(o),width=positive(o.width,'Box width'),height=positive(o.height,'Box height');
    const color=rgb(o.color||'#edf0ef');
    const n=figma.createRectangle();parent.appendChild(n);n.resize(width,height);
    n.x=x;n.y=y;n.name=o.name||'Layout shape';
    n.fills=[{type:'SOLID',color}];return n;
  };
  const photo = (parent,imageHash,o={}) => {
    if(!/^[a-f0-9]{40,64}$/i.test(imageHash))throw new Error('Use the supplied original portrait imageHash');
    const {x,y}=position(o),width=positive(o.width,'Photo width'),height=positive(o.height,'Photo height');
    const n=figma.createRectangle();parent.appendChild(n);n.resize(width,height);
    n.x=x;n.y=y;n.name='Original portrait';
    n.fills=[{type:'IMAGE',imageHash,scaleMode:'FILL'}];return n;
  };
  const stack = (parent,items,o={}) => {
    let y=number(o.y,'y',0);const nodes=[];let lastBottom=y;
    for(const item of items){const entry=typeof item==='string'?{text:item}:item;
      const gap=number(entry.gap===undefined?o.gap:entry.gap,'gap',4);
      const n=text(parent,entry.text,{...o,...entry,y});nodes.push(n);lastBottom=bottom(n);y=bottom(n,gap);}
    return {nodes,bottom:lastBottom};
  };
  const paragraphs = (value) => String(value||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  return {rgb,text,box,photo,stack,bottom,paragraphs};
})();
`;

export function pencilVisualScript(source: Record<string, unknown>, code: string, portrait?: { imageHash: string; width: number; height: number }) {
  return `const source = ${JSON.stringify(source)};\nconst portrait = ${JSON.stringify(portrait ?? null)};\n${VISUAL_TOOLKIT}\n${code}`;
}
