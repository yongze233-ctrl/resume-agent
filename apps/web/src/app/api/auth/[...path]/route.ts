import type { NextRequest } from 'next/server';
import { aiBackendUrl, fetchAiBackend } from '@/lib/ai/backend';

async function forward(request: NextRequest, context: {params:Promise<{path:string[]}>}) {
  if (!aiBackendUrl()) return Response.json({code:'AUTH_UNAVAILABLE'},{status:503});
  const {path} = await context.params;
  if (path.some((part) => !/^[a-z-]+$/.test(part))) return new Response(null,{status:404});
  try {
    const response = await fetchAiBackend(`/api/auth/${path.join('/')}${request.nextUrl.search}`, {
      method:request.method, ...(request.method === 'POST' ? {body:await request.text()} : {}), signal:request.signal,
    });
    const headers = new Headers({'Content-Type':'application/json','Cache-Control':'no-store, private'});
    for (const cookie of response.headers.getSetCookie()) headers.append('Set-Cookie',cookie);
    return new Response(response.body,{status:response.status,headers});
  } catch { return Response.json({code:'AUTH_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
export const GET = forward;
export const POST = forward;
