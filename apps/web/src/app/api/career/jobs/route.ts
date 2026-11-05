import { NextRequest, NextResponse } from 'next/server';
import {
  aiBackendNotConfigured,
  aiBackendUrl,
  fetchAiBackend,
} from '@/lib/ai/backend';
export async function GET(request: NextRequest) {
  if (!aiBackendUrl()) return aiBackendNotConfigured();
  const query =
    request.nextUrl.searchParams.get('q')?.trim().slice(0, 300) ||
    'AI 产品经理 Agent RAG';
  try {
    const response = await fetchAiBackend(
      `/api/resources/jobs?q=${encodeURIComponent(query)}`,
      { signal: request.signal },
    );
    if (!response.ok)
      return NextResponse.json(
        { status: 'unavailable', jobs: [], sources: [] },
        { status: 502 },
      );
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      { status: 'unavailable', jobs: [], sources: [] },
      { status: 502 },
    );
  }
}
