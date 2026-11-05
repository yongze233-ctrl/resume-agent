import { NextRequest, NextResponse } from 'next/server';
import {
  aiBackendNotConfigured,
  aiBackendUrl,
  fetchAiBackend,
} from '@/lib/ai/backend';
export async function GET(request: NextRequest) {
  if (!aiBackendUrl()) return aiBackendNotConfigured();
  const url = request.nextUrl.searchParams.get('url');
  if (!url || url.length > 2000)
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  try {
    const response = await fetchAiBackend(
      `/api/resources/job?url=${encodeURIComponent(url)}`,
      { signal: request.signal },
    );
    if (!response.ok)
      return NextResponse.json(
        { status: 'unavailable' },
        { status: response.status === 404 ? 404 : 502 },
      );
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 502 });
  }
}
