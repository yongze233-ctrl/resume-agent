import type { NextRequest } from 'next/server';
import { fetchAiBackend } from '@/lib/ai/backend';
import { siteAccountsEnabled } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('next');
  const next = requested?.startsWith('/dashboard') && requested.length < 2048 ? requested : '/dashboard';
  if (!siteAccountsEnabled()) return new Response(null,{status:303,headers:{Location:next}});
  const upstream = await fetchAiBackend('/api/auth/get-session');
  const data = await upstream.json() as {user?:{id:string}|null};
  const response = new Response(null,{status:303,headers:{Location:upstream.ok && data.user ? next : '/login'}});
  response.headers.set('Cache-Control','no-store, private');
  for (const cookie of upstream.headers.getSetCookie()) response.headers.append('Set-Cookie',cookie);
  return response;
}
