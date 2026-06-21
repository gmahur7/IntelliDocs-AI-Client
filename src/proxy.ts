import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'auth_token';

const PROTECTED_ROUTES = ['/dashboard'];
const AUTH_ROUTES = ['/sign-in', '/sign-up'];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = request.cookies.has(AUTH_COOKIE);

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = isLoggedIn ? '/dashboard' : '/sign-in';
    return NextResponse.redirect(url);
  }
  if (matches(pathname, PROTECTED_ROUTES) && !isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  if (matches(pathname, AUTH_ROUTES) && isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/sign-in', '/sign-up'],
};
