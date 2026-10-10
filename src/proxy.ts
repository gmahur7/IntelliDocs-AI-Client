import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRoleFromCookie } from '@/lib/auth/session';
import { AUTH_ROUTES, ROLE_HOME, matches, routeRole } from '@/lib/auth/routes';
import { TOKEN_KEY } from '@/lib/auth/token';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(TOKEN_KEY);
  const role = await getRoleFromCookie(request.cookies.get(TOKEN_KEY)?.value);

  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    if (hasCookie && !role) response.cookies.delete(TOKEN_KEY);
    return response;
  };

  if (matches(pathname, AUTH_ROUTES)) {
    return role ? redirect(ROLE_HOME[role]) : NextResponse.next();
  }

  if (!role) return redirect('/sign-in');
  if (routeRole(pathname) !== role) return redirect(ROLE_HOME[role]);

  return NextResponse.next();
}

export const config = {
  // Every page route; skip API routes, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
