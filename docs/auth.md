# Authentication and authorization: design, review, and implementation plan

This document reviews the uncommitted auth work (`src/lib/auth/*`, `src/proxy.ts`), records the decisions taken, and lays out every file to create or change, with code and the reason behind it. It is written against the real backend in `../server` (Express, mounted at `/api/v1`) and the Next 16.2 docs bundled in `node_modules/next/dist/docs`.

---

## 1. Why we are changing the auth model

**Before (committed in `23e77ca` and `059dbdb`):** the browser receives the backend JWT, encrypts it with `crypto-js` using a `NEXT_PUBLIC_` secret, and stores it in a JavaScript-readable `auth_token` cookie. Axios reads it back and sends `Authorization: Bearer` straight to the backend.

Problems with that model:

- The "encryption" secret ships in the client bundle, so it protects nothing.
- The cookie is readable by any script on the page (XSS steals the token outright).
- The proxy can only check that a cookie exists. It cannot verify it, so it cannot do authorization.
- The 15-minute backend access token has no refresh path on the client.

**After (the uncommitted work, completed by this plan):** the backend token never reaches the browser.

```
Browser ──cookie: session (sealed, httpOnly)──▶ Next.js server
                                                  ├─ proxy.ts       verifies + decides allow/redirect/reject, refreshes
                                                  ├─ Server Actions sign-in / sign-up / sign-out (create or destroy cookie)
                                                  ├─ RSC + DAL      requireUser() → backend /auth/me
                                                  └─ /api/[...path] BFF: forwards client fetches with Bearer
                                                                           │
                                                                           ▼
                                                                    Express backend (/api/v1)
```

- The session cookie is a JWE (`jose`, `dir` + `A256GCM`) sealed with `SESSION_SECRET`. It holds `sub`, `role`, the backend `accessToken`, the backend `refreshToken`, and expiry data.
- The cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production, and named `__Host-session` in production (which forces `Secure`, `Path=/`, no `Domain`).
- Client components never hold a token. TanStack Query talks to a same-origin BFF (`/api/...`) that attaches the Bearer server-side.
- Sign-in, sign-up and sign-out are Server Actions wrapped in `useMutation`, so the existing form code keeps its shape.

---

## 2. Backend contract (verified in `../server`)

| Endpoint                     | Auth                  | Request                               | Response `data`                                                                           |
| ---------------------------- | --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/sign-up`  | none                  | `{firstName,lastName,email,password}` | `{token, user}` + `Set-Cookie: refreshToken=…; HttpOnly; Path=/api/v1/auth; SameSite=Lax` |
| `POST /api/v1/auth/sign-in`  | none                  | `{email,password}`                    | same as above                                                                             |
| `POST /api/v1/auth/refresh`  | cookie `refreshToken` | none                                  | same as above (new access token, new refresh cookie)                                      |
| `POST /api/v1/auth/sign-out` | Bearer                | none                                  | clears refresh cookie                                                                     |
| `GET /api/v1/auth/me`        | Bearer                | none                                  | `{user}`                                                                                  |

- Envelope: `{isSuccess:true,status,data}` or `{isSuccess:false,status,error:{message,details?}}` (`server/src/utils/api-response.ts`).
- `user` is `{id, email, firstName, lastName, role}`; `role` is the Prisma enum `ADMIN | USER | GUEST`.
- Access JWT expires after `JWT_ACCESS_EXPIRES_IN` (currently `15m`), refresh after `1d`. `refresh` is stateless (verify + re-issue), so concurrent refreshes are harmless.
- All other routes (`/conversations`, `/files`, `/ask`, `/ask/stream` (SSE), `/documents`, `/users`) require Bearer.

---

## 3. Review of the uncommitted code

### 3.1 Keep as-is (good)

- `src/lib/auth/session.ts`: JWE sealing, key rotation via `SESSION_SECRET_PREVIOUS`, idle TTL (30 min) and absolute TTL (12 h), `isDueForRenewal`, `sessionCookieOptions`, `createSession`, `destroySession`. Only the schema is extended below.
- `src/lib/auth/dal.ts`: `cache()`-memoized session read and profile confirmation, the `expireSession` try/catch (correct: `cookies().set` throws during RSC render, per `cookies.md`), the same-origin check for route handlers, `endSession`.
- `src/proxy.ts` core flow: cookie-only check, verdict handling, skipping redirects for Server Action POSTs (they must check auth themselves, per `proxy.md`), clearing cookies that no longer decrypt, the static-asset-excluding matcher. Proxy runs on Node in Next 16, so `jose` and `Buffer` are fine there.
- `decide()` returning a verdict and only redirecting to constants (no open redirect).

### 3.2 Issues found (each is fixed in section 5)

| #   | Issue                                                                                                                                                                                                                                                                                               | Where                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | `LOGIN_PATH = '/login'` does not exist. Real pages are `/sign-in` and `/sign-up`. With the catch-all matcher, an anonymous visit to `/sign-in` is redirected to a 404.                                                                                                                              | `routes.ts:4`, `decide()`        |
| 2   | `HOME.USER = '/'` is the placeholder page and `HOME.ADMIN = '/admin'` has no page. The ownership rule (`owner = /admin ? ADMIN : USER`) redirects ADMIN users off every non-admin page, so an admin can never open `/dashboard`.                                                                    | `routes.ts:7-10, 36-38`          |
| 3   | `ROLES` lacks `GUEST`. The backend enum has it, so zod rejects guest users at sign-in.                                                                                                                                                                                                              | `routes.ts:1`                    |
| 4   | Wrong endpoints and shapes: `/auth/login`, `/auth/logout`, bare profile from `/auth/me`, `{accessToken,user}`. Also `new URL('/auth/x', API_URL)` discards any path in the base, so `/api/v1` can never be reached that way.                                                                        | `backend.ts`                     |
| 5   | Session stores only the 15-minute access token. The refresh token the backend sets on the server-to-server response is discarded, so every backend call fails after 15 minutes while the session cookie stays "valid" for hours.                                                                    | `session.ts`, `backend.ts`       |
| 6   | `SESSION_EXPIRED_PATH = '/api/auth/session-expired'` has no handler. It is reached whenever a session dies during a server-component render.                                                                                                                                                        | `dal.ts:49-56`                   |
| 7   | The old client token layer is still active. `useSignIn` writes `auth_token`, which the new proxy ignores, so a successful login does not count as logged in.                                                                                                                                        | `token.ts`, `http.ts`, `hooks/*` |
| 8   | `decide()` allows `/api/auth/*` without a session, so any route handler under `/api/auth` must authorize itself.                                                                                                                                                                                    | `routes.ts:21`                   |
| 9   | Dead code in the proxy: `AUTH_COOKIE`, `PROTECTED_ROUTES`, `AUTH_ROUTES`, `matches()`.                                                                                                                                                                                                              | `proxy.ts:13-20`                 |
| 10  | TanStack: no `useMe`, no hydration, `getQueryClient` uses `typeof window` instead of `isServer`, `refetchOnMount:false` blocks refetch after invalidation, `authQuerykeys` typo, unused mutation keys, nothing clears the cache on sign-out.                                                        | `lib/react-query/*`              |
| 11  | UI: `errors.root.serverError` is set but never rendered; links go to `#`; sign-up confirm password is not registered or validated; sign-in page is `'use client'` with unused imports; no sign-out control.                                                                                         | forms, pages                     |
| 12  | Env and tooling: `NEXT_PUBLIC_TOKEN_SECRET`, `JWT_ACCESS_SECRET`, `NEXT_PUBLIC_API_URL` are no longer needed on the client; `SESSION_SECRET` must decode to exactly 32 bytes or `keys()` throws on first request; `eslint-config-next` is 16.2.6 while `next` is 16.2.12; `crypto-js` becomes dead. | `.env.local`, `package.json`     |

---

## 4. Decisions

| Topic                                  | Decision                                                                                                                                                                                                               | Why                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token refresh                          | Store `refreshToken` and `accessExp` in the sealed session. Refresh server-side: pre-emptively in the proxy when the access token is within 60 s of expiry, and reactively in the BFF on an upstream 401 (retry once). | Keeps 15-minute access tokens (small blast radius) while users stay signed in up to 12 h. Only the server ever sees either token.                                         |
| Client → API                           | BFF catch-all at `src/app/api/[...path]/route.ts`. Axios `baseURL` becomes `/api`.                                                                                                                                     | Same-origin requests carry the session cookie automatically. Existing hooks keep their shape. Streaming (`/ask/stream`) passes through.                                   |
| Auth calls                             | Server Actions (`signInAction`, `signUpAction`, `signOutAction`) wrapped in `useMutation`.                                                                                                                             | Only Server Actions and Route Handlers may set cookies. Actions get Next's built-in Origin/Host CSRF check. `useMutation` keeps `isPending`/`onError` semantics in forms. |
| Routes                                 | `LOGIN_PATH='/sign-in'`, `PUBLIC_PATHS=['/sign-in','/sign-up']`, `HOME` maps every role to `/dashboard`. `/admin` stays ADMIN-only in `decide()` for when the page exists.                                             | Matches the pages that exist.                                                                                                                                             |
| Roles                                  | `['USER','ADMIN','GUEST']`. GUEST behaves like USER for routing.                                                                                                                                                       | Matches the backend enum.                                                                                                                                                 |
| Session visibility after proxy refresh | Proxy rewrites the request `cookie` header via `NextResponse.next({ request: { headers } })` and also sets the response cookie.                                                                                        | The same render must see the new token. The header override is documented in `proxy.md` and is deterministic.                                                             |
| BFF authorization                      | Cookie-only (`getSession`). No `/auth/me` round-trip per API call.                                                                                                                                                     | The backend validates the Bearer on every forwarded call anyway.                                                                                                          |
| BFF denylist                           | Never forward `auth/sign-in`, `auth/sign-up`, `auth/refresh`, `auth/sign-out`. Only `auth/me` is allowed under `auth/`.                                                                                                | Those go through Server Actions; forwarding them would bypass session creation and leak backend cookies.                                                                  |
| Action results                         | Return `{ok:true,user} \| {ok:false,status,message}`; never throw across the boundary.                                                                                                                                 | Next redacts thrown error messages in production. The hook converts `ok:false` into a thrown `ApiError` so `onError` still fires.                                         |

---

## 5. Implementation

Steps are ordered so `pnpm build` stays green after each one.

### Step 1: shared types and route constants

#### `src/types/api/api.ts` (replace)

**What:** mirror the backend envelope as a discriminated union.
**Why:** the old `ApiResponse` claimed `data` always exists. Narrowing on `isSuccess` makes error handling type-safe.

```ts
export interface ApiErrorBody {
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  isSuccess: true;
  status: number;
  message?: string;
  data: T;
}

export interface ApiFailure {
  isSuccess: false;
  status: number;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
```

#### `src/types/api/auth.ts` (replace)

**What:** one `User` type shaped like the backend, payload types, and the Server Action result union.
**Why:** the old `AuthResponse` was both envelope and payload, and `AuthError` never matched what was thrown.

```ts
import type { Role } from '@/lib/auth/routes';

export type { Role };

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  firstName: string;
  lastName: string;
}

export type AuthActionResult =
  | { ok: true; user: User }
  | { ok: false; status: number; message: string };
```

#### `src/lib/auth/routes.ts` (replace)

**What:** fix constants, add `GUEST`, add `PUBLIC_PATHS`, fix the ownership rule, export `under`.
**Why:** issues 1, 2, 3. This file must stay free of `server-only` because client hooks import `HOME` and `LOGIN_PATH`.

```ts
export const ROLES = ['USER', 'ADMIN', 'GUEST'] as const;
export type Role = (typeof ROLES)[number];

export const LOGIN_PATH = '/sign-in';
export const PUBLIC_PATHS = ['/sign-in', '/sign-up'] as const;
export const SESSION_EXPIRED_PATH = '/api/auth/session-expired';

export const HOME: Record<Role, string> = {
  USER: '/dashboard',
  ADMIN: '/dashboard',
  GUEST: '/dashboard',
};

export type Verdict =
  | { type: 'allow' }
  | { type: 'redirect'; to: string }
  | { type: 'reject'; status: 401 | 403 };

export const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function decide(pathname: string, role: Role | null): Verdict {
  // /api/auth/* hosts the session-expired handler and must work without a session.
  // Everything under it must authorize itself.
  if (under(pathname, '/api/auth')) return { type: 'allow' };

  if (under(pathname, '/api')) {
    if (!role) return { type: 'reject', status: 401 };
    if (under(pathname, '/api/admin') && role !== 'ADMIN') return { type: 'reject', status: 403 };
    return { type: 'allow' };
  }

  if (PUBLIC_PATHS.some((path) => under(pathname, path))) {
    return role ? { type: 'redirect', to: HOME[role] } : { type: 'allow' };
  }

  if (!role) return { type: 'redirect', to: LOGIN_PATH };

  // Only /admin has a required role. Every other page is open to any signed-in role.
  const required: Role | null = under(pathname, '/admin') ? 'ADMIN' : null;
  if (required && role !== required) return { type: 'redirect', to: HOME[role] };
  return { type: 'allow' };
}
```

#### `src/lib/auth/session.ts` (edit)

**What:** add `refreshToken` and `accessExp` to the session, plus a helper that says when the access token needs refreshing.
**Why:** issue 5. `accessExp` lets the proxy refresh before the backend starts returning 401, without decoding the backend JWT on every request.

```ts
// SessionSchema: add two fields
const SessionSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
  accessToken: z.string().min(1), // backend access token; never leaves the server
  refreshToken: z.string().min(1), // backend refresh token; never leaves the server
  accessExp: z.number().int().positive(), // unix seconds when accessToken expires
  abs: z.number().int().positive(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

type NewSession = Pick<Session, 'sub' | 'role' | 'accessToken' | 'refreshToken' | 'accessExp'> & {
  abs?: number;
};

// Refresh the backend token this many seconds before it expires.
export const ACCESS_REFRESH_SKEW = 60;

export function accessTokenNeedsRefresh(session: Session) {
  return session.accessExp - nowInSeconds() < ACCESS_REFRESH_SKEW;
}

// sealSession: include the new fields in the JWE payload
const token = await new EncryptJWT({
  role: data.role,
  accessToken: data.accessToken,
  refreshToken: data.refreshToken,
  accessExp: data.accessExp,
  abs,
})
  .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
  .setSubject(data.sub)
  .setIssuedAt(now)
  .setExpirationTime(exp)
  .encrypt(keys()[0]);
```

Everything else in the file stays unchanged. Cookie size grows to roughly 1 KB, well under the 4 KB limit.

### Step 2: `src/lib/auth/backend.ts` (replace)

**What:** the only module that talks to the Express backend. It knows the `/api/v1` prefix, the response envelope, and how to capture the refresh cookie.
**Why:** issue 4 and 5. Parsing with zod means a changed backend shape fails loudly at the boundary instead of deep in a page. `getSetCookie()` is available in Node 18.14+ (the project runs Node 24).

```ts
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
```

Never log `accessToken` or `refreshToken`. Log status codes and messages only.

### Step 3: Data Access Layer and the session-expired handler

#### `src/lib/auth/dal.ts` (replace)

**What:** keep the structure; return the full `User`; add `requireUser()` for pages any role may see; export `getSession`, `isSameOrigin` and `deny` for the BFF; make `authorizeApi` skip the profile round-trip by default.
**Why:** `requireUser` is what the dashboard layout needs. The BFF needs the raw session (tokens) and the same-origin check without duplicating them.

```ts
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

// For pages that need a specific role (e.g. /admin).
export async function requireRole(role: Role): Promise<User> {
  const viewer = await getViewer();
  if (!viewer) redirect(LOGIN_PATH);
  if (viewer.role !== role) redirect(HOME[viewer.role]);
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
```

#### `src/app/api/auth/session-expired/route.ts` (new)

**What:** clears the session cookie and sends the user to sign-in.
**Why:** issue 6. A static segment beats `[...path]`, and `decide()` allows `/api/auth/*` unauthenticated, so this always runs.

```ts
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
```

### Step 4: Server Actions

#### `src/lib/validators/auth.ts` (edit)

**What:** split the sign-up fields from the form schema so the form can require `confirmPassword` while the action validates only what the backend accepts.
**Why:** issue 11 (confirm password was not validated).

```ts
import { z } from 'zod';

const email = z.string().min(1, 'Email is required').email('Enter a valid email address');
const password = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters');

export const signInSchema = z.object({ email, password });

// What the backend accepts. Used by signUpAction.
export const signUpPayloadSchema = z.object({
  email,
  password,
  firstName: z
    .string()
    .min(1, 'First Name is required')
    .max(20, 'First Name must be less than 20 characters'),
  lastName: z
    .string()
    .min(1, 'Last Name is required')
    .max(20, 'Last Name must be less than 20 characters'),
});

// What the form collects. Used by SignUpForm.
export const signUpSchema = signUpPayloadSchema
  .extend({ confirmPassword: z.string().min(1, 'Please confirm your password') })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignInFormValues = z.infer<typeof signInSchema>;
export type SignUpFormValues = z.infer<typeof signUpSchema>;
```

#### `src/lib/auth/actions.ts` (new)

**What:** the three auth mutations as Server Actions.
**Why:** cookies can only be set from Server Actions or Route Handlers. Actions re-validate input because they are public endpoints (`data-security.md`). No `redirect()` here: the hook navigates, which keeps `useMutation` callbacks predictable.

```ts
'use server';

import { signInSchema, signUpPayloadSchema } from '@/lib/validators/auth';
import type { AuthActionResult, SignInPayload, SignUpPayload } from '@/types/api/auth';
import { signIn, signUp, type BackendAuthResult } from './backend';
import { endSession } from './dal';
import { createSession } from './session';

async function establish(result: BackendAuthResult): Promise<AuthActionResult> {
  if (!result.ok) return { ok: false, status: result.status, message: result.message };
  await createSession({
    sub: result.user.id,
    role: result.user.role,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    accessExp: result.accessExp,
  });
  return { ok: true, user: result.user };
}

export async function signInAction(input: SignInPayload): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, status: 400, message: 'Enter a valid email and password' };
  return establish(await signIn(parsed.data));
}

export async function signUpAction(input: SignUpPayload): Promise<AuthActionResult> {
  const parsed = signUpPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, message: 'Check the form and try again' };
  return establish(await signUp(parsed.data));
}

export async function signOutAction(): Promise<{ ok: true }> {
  await endSession();
  return { ok: true };
}
```

### Step 5: TanStack Query layer

#### `src/lib/react-query/query-client.ts` (rename from `.tsx`, replace)

**What:** use TanStack's `isServer`, drop `refetchOnMount: false`, add dehydrate options.
**Why:** issue 10. `isServer` is the documented check. `refetchOnMount:false` stops a component from refetching after `invalidateQueries` when it mounts later; `staleTime` already prevents needless refetches. Dehydrating pending queries lets RSC prefetches stream.

```ts
import { QueryClient, defaultShouldDehydrateQuery, isServer } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 5 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
      },
      mutations: { retry: false },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  // On the server every render gets its own client so requests never share cache.
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
```

`src/lib/react-query/provider.tsx` is unchanged (update the import path extension only if your tooling needs it).

#### `src/lib/react-query/server.ts` (new)

**What:** a per-request QueryClient for Server Components.
**Why:** `cache()` scopes it to one request, so a layout and nested pages share prefetched data without leaking between users.

```ts
import 'server-only';

import { cache } from 'react';
import { makeQueryClient } from './query-client';

export const getServerQueryClient = cache(makeQueryClient);
```

#### `src/lib/react-query/query-keys.ts` (replace)

**What:** fix the name, keep only keys that queries use.
**Why:** mutations do not need keys; the unused social keys were noise.

```ts
export const authQueryKeys = {
  all: ['auth'] as const,
  me: () => [...authQueryKeys.all, 'me'] as const,
} as const;
```

#### `src/lib/react-query/queries/auth.ts` (new)

**What:** the current-user query, defined once with `queryOptions` so the key and type are shared by `useQuery`, `setQueryData` and the layout.

```ts
import { queryOptions } from '@tanstack/react-query';
import http from '@/lib/http';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import type { ApiSuccess } from '@/types/api/api';
import type { User } from '@/types/api/auth';

export const meQueryOptions = queryOptions({
  queryKey: authQueryKeys.me(),
  queryFn: async () => {
    // Goes through the BFF (/api/auth/me). The interceptor rejects isSuccess:false,
    // so a resolved response is always a success envelope.
    const { data } = await http.get<ApiSuccess<{ user: User }>>('/auth/me');
    return data.data.user;
  },
});
```

#### `src/hooks/useSignIn.ts` (replace)

**What:** wrap the Server Action, seed the `me` cache, navigate by role.
**Why:** seeding the cache means the dashboard renders the name with no extra request.

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signInAction } from '@/lib/auth/actions';
import { HOME } from '@/lib/auth/routes';
import { ApiError } from '@/lib/http';
import { meQueryOptions } from '@/lib/react-query/queries/auth';
import type { SignInPayload, User } from '@/types/api/auth';

export function useSignIn() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<User, ApiError, SignInPayload>({
    mutationFn: async (input) => {
      const result = await signInAction(input);
      if (!result.ok) throw new ApiError(result.status, result.message);
      return result.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user);
      router.push(HOME[user.role]);
    },
  });
}
```

#### `src/hooks/useSignUp.ts` (new; delete `src/hooks/useSignup.ts`)

Identical to `useSignIn` with `signUpAction` and `SignUpPayload`.

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signUpAction } from '@/lib/auth/actions';
import { HOME } from '@/lib/auth/routes';
import { ApiError } from '@/lib/http';
import { meQueryOptions } from '@/lib/react-query/queries/auth';
import type { SignUpPayload, User } from '@/types/api/auth';

export function useSignUp() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<User, ApiError, SignUpPayload>({
    mutationFn: async (input) => {
      const result = await signUpAction(input);
      if (!result.ok) throw new ApiError(result.status, result.message);
      return result.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user);
      router.push(HOME[user.role]);
    },
  });
}
```

#### `src/hooks/useSignOut.ts` (new)

**Why:** `queryClient.clear()` drops every cached query so the next user never sees the previous user's data. `router.refresh()` discards cached RSC payloads for protected pages.

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/lib/auth/actions';
import { LOGIN_PATH } from '@/lib/auth/routes';

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: signOutAction,
    onSettled: () => {
      queryClient.clear();
      router.push(LOGIN_PATH);
      router.refresh();
    },
  });
}
```

#### `src/hooks/useMe.ts` (new)

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '@/lib/react-query/queries/auth';

export const useMe = () => useQuery(meQueryOptions);
```

### Step 6: HTTP client, and removing the old token layer

#### `src/lib/http.ts` (replace)

**What:** same-origin axios instance, a typed `ApiError` that keeps the status, and a 401 handler.
**Why:** issue 7. There is no token to attach any more. Keeping the status lets callers tell 401 from 500. On 401 the BFF has already cleared the cookie, so a full navigation to sign-in is the correct recovery.

```ts
import axios, { type AxiosError } from 'axios';
import { LOGIN_PATH, PUBLIC_PATHS } from '@/lib/auth/routes';
import type { ApiResponse } from '@/types/api/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

function redirectToSignIn() {
  if (typeof window === 'undefined') return;
  if (PUBLIC_PATHS.some((path) => window.location.pathname.startsWith(path))) return;
  window.location.assign(`${LOGIN_PATH}?reason=expired`);
}

type ErrorBody = ApiResponse<unknown> | { error?: string };

function messageFrom(body: ErrorBody | undefined, fallback: string) {
  if (body && 'isSuccess' in body && body.isSuccess === false) return body.error.message;
  if (body && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown> | undefined;
    if (body && body.isSuccess === false) {
      throw new ApiError(response.status, body.error.message, body.error.details);
    }
    return response;
  },
  (error: AxiosError<ErrorBody>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    if (status === 401) redirectToSignIn();
    const details =
      body && 'isSuccess' in body && body.isSuccess === false ? body.error.details : undefined;
    return Promise.reject(new ApiError(status, messageFrom(body, error.message), details));
  },
);

export default http;
```

#### Delete `src/lib/auth/token.ts`

```sh
pnpm remove crypto-js @types/crypto-js
```

Nothing else may import it after Step 5.

### Step 7: BFF catch-all route

#### `src/app/api/[...path]/route.ts` (new)

**What:** forwards any `/api/<path>` request to `${API_URL}/api/v1/<path>` with the server-held Bearer, refreshing the token when needed.
**Why:** this is how client components reach the backend without ever seeing a token. The request body is buffered because a retry after refresh needs it twice. The response body is streamed so SSE works. Upstream `Set-Cookie` is stripped so backend cookies never reach the browser. `content-encoding` and `content-length` are dropped because `fetch` already decompressed the body.

```ts
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
```

`RouteContext<'/api/[...path]'>` is the typed helper generated by `next build`/`next dev` (see `route.md`). Run `pnpm dev` once before type-checking so the route types exist.

Multipart uploads (`/files/upload`) work because `content-type` with its boundary is forwarded and the buffered body is re-sent unchanged.

### Step 8: proxy cleanup and pre-emptive refresh

#### `src/proxy.ts` (replace)

**What:** remove dead code, add the refresh branch, make the refreshed cookie visible to the current render.
**Why:** issue 9 and 5. The docs warn against slow work in the proxy. This fetch happens at most once per user per ~15 minutes, has a 5 s timeout, and on network failure falls through so the page still renders (the BFF and DAL cover the stale token). `server-only` imports are safe here: Next aliases `server-only` to an empty module in every server bundle, which includes the Node-runtime proxy.

```ts
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
```

### Step 9: UI

#### `src/app/dashboard/layout.tsx` (new)

**What:** gate the dashboard on the server and hydrate the `me` query.
**Why:** `requireUser()` confirms the session with the backend once per request. Seeding the server QueryClient and wrapping children in `HydrationBoundary` means `useMe()` has data on first paint with no client fetch. Note from `authentication.md`: layouts do not re-render on client navigation between their children, so the proxy remains the per-request gate; this layout adds the backend confirmation on full loads.

```tsx
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/dal';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import { getServerQueryClient } from '@/lib/react-query/server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const queryClient = getServerQueryClient();
  queryClient.setQueryData(authQueryKeys.me(), user);

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
```

#### `src/components/features/dashboard/DashboardHeader.tsx` (new)

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/useMe';
import { useSignOut } from '@/hooks/useSignOut';

export function DashboardHeader() {
  const { data: user } = useMe();
  const signOut = useSignOut();

  return (
    <header className="flex w-full items-center justify-between border-b px-6 py-3">
      <p className="text-sm">
        {user ? `${user.firstName} ${user.lastName}` : 'Loading…'}
        {user && <span className="text-muted-foreground"> · {user.email}</span>}
      </p>
      <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </Button>
    </header>
  );
}
```

#### `src/app/dashboard/page.tsx` (edit)

```tsx
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';

export default function DashboardPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">You are signed in.</p>
      </main>
    </div>
  );
}
```

#### `src/components/features/sign-in/SignInForm.tsx` (edit)

**What:** stop navigating in the form (the hook does it), type the error as `ApiError`, render the server error, link to sign-up.

```tsx
// imports: replace AuthError/useRouter with
import Link from 'next/link';
import type { ApiError } from '@/lib/http';

// inside the component: remove `const router = useRouter();`
function onSubmit(data: SignInFormValues) {
  mutate(data, {
    onError: (err: ApiError) => setError('root.serverError', { message: err.message }),
  });
}

// in the JSX, just before the submit button Field:
{
  errors.root?.serverError && (
    <FieldDescription className="text-destructive text-center">
      {errors.root.serverError.message}
    </FieldDescription>
  );
}

// replace the "Sign up" anchor:
<Link href="/sign-up" className="underline underline-offset-4">
  Sign up
</Link>;
```

#### `src/components/features/sign-up/SignUpForm.tsx` (edit)

Same changes as the sign-in form, plus register the confirm-password input, strip it before calling the mutation, fix the first-name `id`, and import from the renamed hook file.

```tsx
import Link from 'next/link';
import type { ApiError } from '@/lib/http';
import { useSignUp } from '@/hooks/useSignUp';

// defaultValues: add confirmPassword: ''

function onSubmit({ email, password, firstName, lastName }: SignUpFormValues) {
  mutate(
    { email, password, firstName, lastName },
    { onError: (err: ApiError) => setError('root.serverError', { message: err.message }) },
  );
}

// first name input: id="firstName"

// confirm password Field:
<Field>
  <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
  <Input id="confirmPassword" type="password" {...register('confirmPassword')} required />
  {errors.confirmPassword ? (
    <FieldDescription className="text-destructive">{errors.confirmPassword.message}</FieldDescription>
  ) : (
    <FieldDescription>Please confirm your password.</FieldDescription>
  )}
</Field>

// server error block before the submit button, same as sign-in

// replace the "Sign in" anchor:
<Link href="/sign-in" className="underline underline-offset-4">Sign in</Link>
```

#### `src/app/(auth)/sign-in/page.tsx` (edit)

**What:** make it a Server Component (drop `'use client'` and the unused imports) and surface the `reason=expired` notice.

```tsx
import { GalleryVerticalEnd } from 'lucide-react';
import { SignInForm } from '@/components/features/sign-in/SignInForm';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* left column unchanged */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        {/* brand row unchanged */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            {reason === 'expired' && (
              <p className="text-muted-foreground mb-4 text-center text-sm">
                Your session expired. Please sign in again.
              </p>
            )}
            <SignInForm />
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### `src/app/page.tsx` (replace)

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard'); // the proxy sends anonymous users to /sign-in first
}
```

### Step 10: environment and tooling

#### `.env.local`

```sh
API_URL=http://localhost:4000
SESSION_SECRET=<output of: openssl rand -base64 32>
# SESSION_SECRET_PREVIOUS=<old secret while rotating>
```

Remove `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TOKEN_SECRET` and `JWT_ACCESS_SECRET`: the browser no longer talks to the backend or holds a secret, and the client never verifies backend JWTs. `SESSION_SECRET` must decode to exactly 32 bytes or `keys()` throws on the first request.

Add a committed `.env.example` with the same keys and placeholder values.

#### `package.json`

```sh
pnpm add -D eslint-config-next@16.2.12   # match next
pnpm remove crypto-js @types/crypto-js
```

No backend changes are required.

---

## 6. Security checklist

- Session cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, no `Domain` (valid for the `__Host-` prefix).
- Tokens never reach the client: `backend.ts`, `dal.ts`, `session.ts` and `react-query/server.ts` import `server-only`; actions return only `User`.
- CSRF: Server Actions get Next's Origin/Host check; BFF writes use `isSameOrigin`; the BFF never forwards the client's `Authorization` or `Cookie` headers upstream and strips upstream `Set-Cookie`.
- Every Server Action re-validates its input with zod. The proxy never redirects a Server Action, so each action is responsible for its own auth.
- Backend responses are zod-parsed before use.
- Redirect targets are constants only (`decide`, `HOME[role]`, `LOGIN_PATH`).
- No token is ever logged.

---

## 7. Verification

1. `pnpm lint && pnpm build` pass.
2. Start the backend with `JWT_ACCESS_EXPIRES_IN=30s` (temporarily) and the client with a valid `SESSION_SECRET`.
3. Sign up: lands on `/dashboard`, header shows the name. In React Query Devtools `['auth','me']` is present with no fetch.
4. Sign out: lands on `/sign-in`, Devtools cache is empty, visiting `/dashboard` redirects to `/sign-in`.
5. Signed in: `/sign-in` and `/sign-up` redirect to `/dashboard`; `/admin` as a USER redirects to `/dashboard`.
6. Without a cookie: `curl -i localhost:3000/api/auth/me` returns 401 from the BFF; `curl -i localhost:3000/api/documents` returns 401 from the proxy. With a cookie but a foreign `Origin` header, `POST /api/ask` returns 403.
7. Wait more than 30 s, then navigate: the response carries a new `Set-Cookie: session=` and the page renders (proxy refresh). Wait again and trigger a client query (refetch `['auth','me']` from Devtools): 200 plus a new cookie (BFF refresh and retry).
8. Set `JWT_REFRESH_EXPIRES_IN=1m` on the backend, sign in, wait, navigate: you land on `/sign-in?reason=expired` and the cookie is gone.
9. Edit the `session` cookie value in DevTools, reload: the cookie is cleared and you are on `/sign-in`.
10. `curl -N` a `POST /api/ask/stream` through the BFF with a valid cookie: SSE chunks arrive incrementally.
