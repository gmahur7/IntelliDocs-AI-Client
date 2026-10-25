import 'server-only';

import { decodeJwt } from 'jose';
import * as z from 'zod';
import { ROLES } from './routes';
import type { SignInPayload, SignUpPayload, User } from '@/types/api/auth';

const API_PREFIX = '/api/v1';
const TIMEOUT_MS = 5_000;

// http://localhost:4000 -> http://localhost:4000/api/v1
export function apiBase() {
  const base = process.env.API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('API_URL is not set');
  return `${base}${API_PREFIX}`;
}

const apiUrl = (path: string) => `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;

export const UserSchema = z.object({
  id: z.coerce.string().min(1),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(ROLES),
});

// The backend envelope: { isSuccess, status, data } | { isSuccess: false, status, error }
function envelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('isSuccess', [
    z.object({ isSuccess: z.literal(true), status: z.number(), data }),
    z.object({
      isSuccess: z.literal(false),
      status: z.number(),
      error: z.object({ message: z.string(), details: z.unknown().optional() }),
    }),
  ]);
}

const AuthEnvelope = envelope(z.object({ token: z.string().min(1), user: UserSchema }));
const MeEnvelope = envelope(z.object({ user: UserSchema }));

export type BackendAuthResult =
  | { ok: true; accessToken: string; accessExp: number; refreshToken: string; user: User }
  | { ok: false; status: number; message: string };

// The backend sets the refresh token as a cookie on its response. Because the Next.js
// server made the request, that cookie would otherwise be lost. Pull it out of Set-Cookie.
function readRefreshCookie(response: Response): string | null {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).trim() === 'refreshToken') {
      return decodeURIComponent(pair.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}

// Read `exp` from the backend JWT without verifying it (we never trust it for auth,
// only to know when to refresh). Fall back to 15 minutes if the claim is missing.
function accessExpiry(token: string): number {
  try {
    const { exp } = decodeJwt(token);
    if (exp) return exp;
  } catch {
    // not a JWT; use the fallback
  }
  return Math.floor(Date.now() / 1000) + 15 * 60;
}

async function authCall(path: string, init: RequestInit): Promise<BackendAuthResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 503, message: 'Auth service is unreachable' };
  }

  const parsed = AuthEnvelope.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false,
      status: response.status || 502,
      message: 'Unexpected response from auth service',
    };
  }
  if (!parsed.data.isSuccess) {
    return { ok: false, status: parsed.data.status, message: parsed.data.error.message };
  }

  const refreshToken = readRefreshCookie(response);
  if (!refreshToken) {
    return { ok: false, status: 502, message: 'Auth service did not issue a refresh token' };
  }

  const { token, user } = parsed.data.data;
  return { ok: true, accessToken: token, accessExp: accessExpiry(token), refreshToken, user };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const signIn = (payload: SignInPayload) => authCall('/auth/sign-in', jsonPost(payload));
export const signUp = (payload: SignUpPayload) => authCall('/auth/sign-up', jsonPost(payload));

// The backend reads the refresh token from a cookie, so send it as one.
export const refreshAccess = (refreshToken: string) =>
  authCall('/auth/refresh', {
    method: 'POST',
    headers: { cookie: `refreshToken=${encodeURIComponent(refreshToken)}` },
  });

export function backendFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (typeof init.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(apiUrl(path), { ...init, headers, cache: 'no-store' });
}

export async function fetchProfile(accessToken: string): Promise<User | null> {
  const response = await backendFetch(accessToken, '/auth/me');
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Profile API responded with ${response.status}`);
  const parsed = MeEnvelope.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data.isSuccess ? parsed.data.data.user : null;
}

export async function revokeToken(accessToken: string) {
  await backendFetch(accessToken, '/auth/sign-out', { method: 'POST' });
}
