import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-resume-return-path',request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({request:{headers}});
}
export const config = {matcher:['/dashboard/:path*']};
