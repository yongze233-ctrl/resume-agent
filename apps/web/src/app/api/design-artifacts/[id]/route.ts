import { NextResponse } from 'next/server';
import { aiBackendNotConfigured, aiBackendUrl, fetchAiBackend } from '@/lib/ai/backend';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  if (!aiBackendUrl()) return aiBackendNotConfigured();
  const response = await fetchAiBackend(`/api/design-artifacts/${id}`);
  if (!response.ok) return new NextResponse(null, { status: response.status });
  return NextResponse.json(await response.json(), { headers: { 'Cache-Control': 'no-store, private' } });
}
