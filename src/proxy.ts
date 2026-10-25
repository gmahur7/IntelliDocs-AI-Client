import { NextResponse, type NextRequest } from 'next/server';
import { refreshAccess } from '@/lib/auth/backend';
import { LOGIN_PATH, decide, under } from '@/lib/auth/routes';
import {
  SESSION_COOKIE,
  accessTokenNeedsRefresh,
  isDueForRenewal,
  sealSession,
  sessionCookieOptions,
  unsealSession,
} from '@/lib/auth/session';

type Renewed = { token: string; expires: Date };

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await unsealSession(token);
  const verdict = decide(pathname, session?.role ?? null);
  // Server Actions must do their own auth check (docs). Never redirect their POSTs.
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');

  if (verdict.type === 'reject') {
    const error = verdict.status === 401 ? 'Unauthorized' : 'Forbidden';
    return NextResponse.json({ error }, { status: verdict.status });
  }

  if (verdict.type === 'redirect' && !isServerAction) {
    const response = NextResponse.redirect(new URL(verdict.to, request.nextUrl));
    // A cookie that no longer decrypts is dead weight. Remove it.
    if (token && !session) clearSession(response);
    return response;
  }

  let renewed: Renewed | null = null;

  if (session && accessTokenNeedsRefresh(session)) {
    // Bounded cost: once per user per access-token lifetime, 5 s timeout inside refreshAccess.
    const result = await refreshAccess(session.refreshToken);
    if (result.ok) {
      renewed = await sealSession({
        ...session,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessExp: result.accessExp,
      });
    } else if (result.status === 401) {
      // The refresh token itself is dead. The session is over.
      return signedOut(request, pathname, isServerAction);
    }
    // Any other failure (backend down, timeout): continue with the stale token.
  } else if (session && isDueForRenewal(session)) {
    renewed = await sealSession(session);
  }

  if (!renewed) return NextResponse.next();

  // Make the renewed cookie visible to this request's render as well as future requests.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    'cookie',
    replaceCookie(request.headers.get('cookie') ?? '', SESSION_COOKIE, renewed.token),
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(SESSION_COOKIE, renewed.token, sessionCookieOptions(renewed.expires));
  return response;
}

function signedOut(request: NextRequest, pathname: string, isServerAction: boolean) {
  const response = under(pathname, '/api')
    ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    : isServerAction
      ? NextResponse.next() // the action re-checks auth and will fail cleanly
      : NextResponse.redirect(new URL(`${LOGIN_PATH}?reason=expired`, request.nextUrl));
  clearSession(response);
  return response;
}

function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)));
}

function replaceCookie(header: string, name: string, value: string) {
  const parts = header.split(/;\s*/).filter((part) => part && !part.startsWith(`${name}=`));
  parts.push(`${name}=${value}`);
  return parts.join('; ');
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
