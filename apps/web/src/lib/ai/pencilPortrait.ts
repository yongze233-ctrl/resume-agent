import { BACKEND_PROXY_ORIGIN } from '../api/routes';

export interface OriginalPortrait {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

export async function readOriginalPortrait(
  key: string,
  signal: AbortSignal,
): Promise<{
  status: 'available' | 'none' | 'ambiguous';
  image?: OriginalPortrait;
}> {
  const response = await fetch(
    `${BACKEND_PROXY_ORIGIN}/api/uploads/attachment/portrait`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal,
    },
  );
  if (!response.ok) throw new Error('portrait_unavailable');
  const { data } = await response.json();
  return {
    status: data.status,
    image: data.status === 'available' ? data.candidates?.[0] : undefined,
  };
}

/** A conservative, undoable repair for existing absolute-positioned layouts. */
export function portraitRepairScript(
  image: OriginalPortrait,
  frameId?: string,
  place = true,
): string {
  if (
    !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl) ||
    image.dataUrl.length > 6_000_000 ||
    !(image.width > 0 && image.height > 0)
  )
    throw new Error('invalid_portrait');
  return `
const asset=${JSON.stringify(image)};
const image=figma.createImage(figma.base64Decode(asset.dataUrl.split(',')[1]));
const root=figma.getNodeById(${JSON.stringify(frameId ?? '')});
if(!root||root.type!=='FRAME')return {status:'no_frame',imageHash:image.hash};
const bounds=n=>{let x=n.x,y=n.y,p=n.parent;while(p&&p.id!==root.id&&p.type!=='PAGE'){x+=p.x||0;y+=p.y||0;p=p.parent;}return {x,y,width:n.width,height:n.height};};
const visible=n=>{let p=n;while(p&&p.id!==root.id){if(p.visible===false)return false;p=p.parent;}return true;};
const inside=b=>b.x>=0&&b.y>=0&&b.x+b.width<=root.width&&b.y+b.height<=root.height;
const retained=root.findAll(n=>visible(n)&&n.width>=20&&n.height>=20&&typeof n.fills!=='symbol'&&(n.fills||[]).some(f=>f.type==='IMAGE'&&f.imageHash===image.hash)&&inside(bounds(n)));
if(retained.length)return {status:'retained',imageHash:image.hash,nodeId:retained[0].id,frameId:root.id};
if(!${JSON.stringify(place)})return {status:'loaded',imageHash:image.hash,frameId:root.id};
const fill=[{type:'IMAGE',imageHash:image.hash,scaleMode:'FILL'}];
const placeholder=root.findAll(n=>visible(n)&&n.type!=='TEXT'&&n.width>=35&&n.width<=140&&n.height>=45&&n.height<=170&&/^(照片|头像|photo|portrait|original portrait|原简历照片)$/i.test(n.name.trim())&&inside(bounds(n))&&typeof n.fills!=='symbol'&&!(n.fills||[]).some(f=>f.type==='IMAGE'))[0];
if(placeholder){placeholder.fills=fill;const b=bounds(placeholder);for(const label of root.findAll(n=>n.type==='TEXT'&&/^(照片|头像|photo|portrait)$/i.test(n.characters.trim()))){const t=bounds(label);if(t.x>=b.x&&t.y>=b.y&&t.x+t.width<=b.x+b.width&&t.y+t.height<=b.y+b.height)label.remove();}return {status:'inserted',placement:'placeholder',imageHash:image.hash,nodeId:placeholder.id,frameId:root.id};}
if(root.layoutMode&&root.layoutMode!=='NONE')return {status:'needs_layout',imageHash:image.hash,frameId:root.id};
const margin=24, height=Math.min(92,Math.max(70,60*asset.height/asset.width)),width=height*asset.width/asset.height;
const leaves=root.findAll(n=>visible(n)&&n.width>0&&n.height>1&&((n.type==='TEXT'&&n.characters.trim())||(n.type==='RECTANGLE'&&n.width<root.width*.6&&n.height<root.height*.6)));
const overlaps=(a,b)=>a.x<b.x+b.width+7&&a.x+a.width+7>b.x&&a.y<b.y+b.height+7&&a.y+a.height+7>b.y;
let slot=[{x:root.width-margin-width,y:margin},{x:margin,y:margin}].find(p=>!leaves.some(n=>overlaps({...p,width,height},bounds(n))));
let placement='header';
const shifted=[];
if(!slot){
 const body=leaves.filter(n=>n.type==='TEXT'&&bounds(n).y>120&&bounds(n).y<root.height*.85);
 let split;
 for(let x=root.width*.2;x<root.width*.45;x+=3){if(!body.some(n=>{const b=bounds(n);return b.x<x&&b.x+b.width>x;})&&body.filter(n=>bounds(n).x+ n.width<=x).length>=4&&body.filter(n=>bounds(n).x>=x).length>=4){split=x;break;}}
 if(!split)return {status:'needs_layout',imageHash:image.hash,frameId:root.id};
 const left=root.children.filter(n=>visible(n)&&n.height>0&&n.width>0&&n.x>=margin-5&&n.x+n.width<=split&&n.y<root.height*.85&&n.height<root.height*.6);
 const right=leaves.filter(n=>bounds(n).x>=split);
 const footerTop=Math.min(root.height-margin,...leaves.filter(n=>bounds(n).x<split&&bounds(n).y>=root.height*.85).map(n=>bounds(n).y-12));
 const delta=height+14;
 if(left.length>=4&&right.length>=4&&left.every(n=>n.y+n.height+delta<=footerTop)){
  const x=Math.min(...left.map(n=>n.x)),y=Math.min(...left.map(n=>n.y));
  if(x+width<=split){left.forEach(n=>{shifted.push({n,y:n.y});n.y+=delta;});slot={x,y};placement='sidebar';}
 }
}
if(!slot)return {status:'needs_layout',imageHash:image.hash,frameId:root.id};
if(leaves.some(n=>overlaps({...slot,width,height},bounds(n)))){shifted.forEach(({n,y})=>{n.y=y;});return {status:'needs_layout',imageHash:image.hash,frameId:root.id};}
const photo=figma.createRectangle();root.appendChild(photo);photo.name='原简历照片';photo.resize(width,height);photo.x=slot.x;photo.y=slot.y;photo.fills=fill;photo.cornerRadius=2;
return {status:'inserted',placement,imageHash:image.hash,nodeId:photo.id,frameId:root.id};`;
}
