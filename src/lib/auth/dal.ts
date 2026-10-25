import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch, fetchProfile, revokeToken } from './backend';
import { HOME, LOGIN_PATH, SESSION_EXPIRED_PATH, type Role } from './routes';
import { SESSION_COOKIE, destroySession, unsealSession } from './session';
import type { User } from '@/types/api/auth';

export type Viewer = { userId: string; role: Role };

// Memoized per request: many components can call this without re-decrypting the cookie.
export const getSession = cache(async () => {
  const cookieStore = await cookies();
  return unsealSession(cookieStore.get(SESSION_COOKIE)?.value);
});

// Confirms the session against the backend (one /auth/me call per request).
const confirmedUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;
  const profile = await fetchProfile(session.accessToken);
  if (!profile || profile.id !== session.sub || profile.role !== session.role) return null;
  return profile;
});

// Optimistic: trusts the sealed cookie, no network. Use for cheap checks and the BFF.
export async function getViewer(): Promise<Viewer | null> {
  const session = await getSession();
  return session ? { userId: session.sub, role: session.role } : null;
}

// For pages any signed-in role may see. Redirects when signed out; expires a dead session.
export async function requireUser(): Promise<User> {
  const viewer = await getViewer();
  if (!viewer) redirect(LOGIN_PATH);
  const user = await confirmedUser();
  if (!user) return expireSession();
  return user;
}

// For pages restricted to specific roles. Anyone else is sent to their own home.
//   admin layout:  requireRole('ADMIN')
//   member layout: requireRole(...MEMBER_ROLES)
export async function requireRole(...roles: Role[]): Promise<User> {
  const viewer = await getViewer();
  if (!viewer) redirect(LOGIN_PATH);
  if (!roles.includes(viewer.role)) redirect(HOME[viewer.role]);
  const user = await confirmedUser();
  if (!user) return expireSession();
  return user;
}

// Server-side call to the backend from RSC / Server Actions.
export async function api(path: string, init?: RequestInit): Promise<Response> {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  const response = await backendFetch(session.accessToken, path, init);
  if (response.status === 401) return expireSession();
  return response;
}

// Server Components cannot set cookies. When that is the case, bounce through a
// Route Handler (SESSION_EXPIRED_PATH) that clears the cookie and redirects.
async function expireSession(): Promise<never> {
  try {
    await destroySession();
  } catch {
    redirect(SESSION_EXPIRED_PATH);
  }
  redirect(`${LOGIN_PATH}?reason=expired`);
}

type AuthorizeOptions = { role?: Role; confirm?: boolean };

// For Route Handlers that are not the BFF. `confirm: true` adds a backend /auth/me check.
export async function authorizeApi(
  request: Request,
  { role, confirm = false }: AuthorizeOptions = {},
): Promise<User | Viewer | Response> {
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (isWrite && !isSameOrigin(request)) return deny(403);

  const viewer = await getViewer();
  if (!viewer) return deny(401);
  if (role && viewer.role !== role) return deny(403);
  if (!confirm) return viewer;

  const user = await confirmedUser();
  if (!user) {
    await destroySession();
    return deny(401);
  }
  return user;
}

export const deny = (status: 401 | 403) =>
  Response.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });

// CSRF guard for Route Handlers. Server Actions get this check from Next.js itself.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function endSession() {
  const session = await getSession();
  if (session) await revokeToken(session.accessToken).catch(() => {});
  await destroySession();
}
