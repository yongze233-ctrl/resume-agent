import type {NextRequest} from 'next/server';
import {fetchAiBackend,aiBackendUrl} from '@/lib/ai/backend';
export async function POST(request:NextRequest) {
  const headers={'Cache-Control':'no-store, private'};
  if(!aiBackendUrl())return new Response(null,{status:204,headers});
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400,headers});
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const body=new TextDecoder().decode(bytes);JSON.parse(body);
    const response=await fetchAiBackend('/api/diagnostics/frontend',{method:'POST',body,signal:AbortSignal.timeout(4000)});
    return new Response(response.body,{status:response.status,headers:{...headers,'Content-Type':'application/json'}});
  }catch{return new Response(null,{status:400,headers});}finally{reader.releaseLock();}
}
