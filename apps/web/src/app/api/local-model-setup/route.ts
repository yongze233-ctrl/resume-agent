import { NextRequest, NextResponse } from 'next/server';

const privateHeaders = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };

function allowed(request: NextRequest) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)) return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const browserOrigin = new URL(origin);
    // Next may normalize the internal URL to localhost while the browser uses 127.0.0.1.
    return browserOrigin.protocol === request.nextUrl.protocol && browserOrigin.host === (request.headers.get('host') ?? request.nextUrl.host);
  } catch { return false; }
}

/** Optional loopback handoff into the browser's normal encrypted BYOK vault. */
export async function GET(request: NextRequest) {
  if (!allowed(request)) return new NextResponse(null, { status: 403, headers: privateHeaders });
  const endpoint = process.env.LOCAL_MODEL_SETUP_URL;
  const token = process.env.LOCAL_MODEL_SETUP_TOKEN;
  if (!endpoint || !token) return new NextResponse(null, { status: 204, headers: privateHeaders });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('invalid_setup_endpoint');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(1500) });
    if (!response.ok) return new NextResponse(null, { status: 204, headers: privateHeaders });
    return NextResponse.json(await response.json(), { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 204, headers: privateHeaders });
  }
}

/** The local helper can retire its in-memory handoff after durable browser import. */
export async function POST(request: NextRequest) {
  if (!allowed(request)) return new NextResponse(null, { status: 403, headers: privateHeaders });
  const endpoint = process.env.LOCAL_MODEL_SETUP_URL;
  const token = process.env.LOCAL_MODEL_SETUP_TOKEN;
  if (!endpoint || !token) return new NextResponse(null, { status: 204, headers: privateHeaders });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('invalid_setup_endpoint');
    const body = await request.json() as { setupId?: unknown };
    if (typeof body.setupId !== 'string' || body.setupId.length > 128) throw new Error('invalid_setup_receipt');
    const page = new URL(request.headers.get('referer') ?? request.nextUrl.origin).pathname;
    await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Setup-Page': page }, body: JSON.stringify({ setupId: body.setupId }), cache: 'no-store', signal: AbortSignal.timeout(1500) });
  } catch { /* Receipt failure does not undo an encrypted, durable import. */ }
  return new NextResponse(null, { status: 204, headers: privateHeaders });
}
