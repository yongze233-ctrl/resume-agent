import { fetchAiBackend } from '@/lib/ai/backend';

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))) return Response.json({ error: 'invalid_path' }, { status: 400 });
  const response = await fetchAiBackend(`/api/openpencil/${path.join('/')}`, { method: request.method, ...(request.method === 'POST' ? { body: await request.text(), headers: { 'Content-Type': 'application/json' } } : {}) });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store, private' } });
}
export const GET = proxy;
export const POST = proxy;
