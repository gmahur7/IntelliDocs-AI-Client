import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL(`${LOGIN_PATH}?reason=expired`, request.nextUrl),
    303,
  );
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)));
  return response;
}
