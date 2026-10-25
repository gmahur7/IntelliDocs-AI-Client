import { NextResponse, type NextRequest } from 'next/server';
import { apiBase, refreshAccess } from '@/lib/auth/backend';
import { deny, getSession, isSameOrigin } from '@/lib/auth/dal';
import {
  SESSION_COOKIE,
  accessTokenNeedsRefresh,
  sealSession,
  sessionCookieOptions,
  type Session,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// These are handled by Server Actions. Forwarding them would bypass session creation.
const DENIED = new Set(['auth/sign-in', 'auth/sign-up', 'auth/refresh', 'auth/sign-out']);
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language'];
const STRIPPED_RESPONSE_HEADERS = [
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
];

type Renewed = { token: string; expires: Date };

async function handle(request: NextRequest, context: RouteContext<'/api/[...path]'>) {
  const { path } = await context.params;
  const upstreamPath = path.join('/');

  if (
    DENIED.has(upstreamPath) ||
    (upstreamPath.startsWith('auth/') && upstreamPath !== 'auth/me')
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (isWrite && !isSameOrigin(request)) return deny(403);

  const initial = await getSession();
  if (!initial) return deny(401);

  const state: { session: Session; renewed: Renewed | null } = { session: initial, renewed: null };

  const body = isWrite ? await request.arrayBuffer() : undefined;
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const url = `${apiBase()}/${upstreamPath}${request.nextUrl.search}`;

  const send = (accessToken: string) => {
    const withBearer = new Headers(headers);
    withBearer.set('authorization', `Bearer ${accessToken}`);
    return fetch(url, {
      method: request.method,
      headers: withBearer,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });
  };

  // Exchange the refresh token for a new access token and re-seal the session.
  // `abs` is carried over so a refresh never extends the absolute 12 h limit.
  const refresh = async (): Promise<'ok' | 'denied' | 'unavailable'> => {
    const result = await refreshAccess(state.session.refreshToken);
    if (!result.ok) return result.status === 401 ? 'denied' : 'unavailable';
    state.session = {
      ...state.session,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessExp: result.accessExp,
    };
    state.renewed = await sealSession(state.session);
    return 'ok';
  };

  if (accessTokenNeedsRefresh(state.session)) {
    const outcome = await refresh();
    if (outcome === 'denied') return expired();
    if (outcome === 'unavailable') return unavailable();
  }

  let upstream = await send(state.session.accessToken);

  // The backend rejected a token we thought was valid. Refresh once and retry.
  if (upstream.status === 401 && !state.renewed) {
    const outcome = await refresh();
    if (outcome === 'denied') return expired();
    if (outcome === 'unavailable') return unavailable();
    upstream = await send(state.session.accessToken);
    if (upstream.status === 401) return expired();
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of STRIPPED_RESPONSE_HEADERS) responseHeaders.delete(name);

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  if (state.renewed) {
    response.cookies.set(
      SESSION_COOKIE,
      state.renewed.token,
      sessionCookieOptions(state.renewed.expires),
    );
  }
  return response;
}

function expired() {
  const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)));
  return response;
}

const unavailable = () => NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
