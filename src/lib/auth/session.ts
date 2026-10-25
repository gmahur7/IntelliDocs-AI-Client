import 'server-only';
import z from 'zod';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { ROLES } from './routes';
import { cookies } from 'next/headers';

const isProd = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE = isProd ? '__Host-session' : 'session';

const IDLE_TTL = 30 * 60; // seconds of inactivity before the session ends
const ABSOLUTE_TTL = 12 * 60 * 60; // hard limit, however active the user is
const RENEW_AFTER = 5 * 60; // re-issue at most this often

const SessionSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
  accessToken: z.string().min(1), // the backend's token; never leaves the server
  refreshToken: z.string().min(1), // backend refresh token; never leaves the server
  accessExp: z.number().int().positive(), // unix seconds when accessToken expires
  abs: z.number().int().positive(), // absolute deadline (unix seconds)
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

export type Session = z.infer<typeof SessionSchema>;
type NewSession = Pick<Session, 'sub' | 'role' | 'accessToken' | 'refreshToken' | 'accessExp'> & {
  abs?: number;
};

export const ACCESS_REFRESH_SKEW = 60;

let cachedKeys: Uint8Array[] | undefined;

function keys(): Uint8Array[] {
  if (cachedKeys) return cachedKeys;

  const secrets = [process.env.SESSION_SECRET, process.env.SESSION_SECRET_PREVIOUS].filter(
    (value): value is string => Boolean(value),
  );

  if (secrets.length === 0) throw new Error('SESSION_SECRET is not set');

  cachedKeys = secrets.map((secret) => {
    const key = new Uint8Array(Buffer.from(secret, 'base64'));
    if (key.length !== 32) {
      throw new Error('SESSION_SECRET must be 32 random bytes, base64-encoded');
    }
    return key;
  });
  return cachedKeys;
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

export function accessTokenNeedsRefresh(session: Session) {
  return session.accessExp - nowInSeconds() < ACCESS_REFRESH_SKEW;
}

export async function sealSession(data: NewSession) {
  const now = nowInSeconds();
  const abs = data.abs ?? now + ABSOLUTE_TTL;
  const exp = Math.min(now + IDLE_TTL, abs);

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

  return { token, expires: new Date(exp * 1000) };
}

export async function unsealSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  for (const key of keys()) {
    try {
      const { payload } = await jwtDecrypt(token, key, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      });
      const parsed = SessionSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      // Wrong key, modified token or expired token. Try the next key, if any.
    }
  }
  return null;
}

export function isDueForRenewal(session: Session) {
  return nowInSeconds() - session.iat >= RENEW_AFTER && session.exp < session.abs;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true, // JavaScript in the page cannot read it
    secure: isProd, // HTTPS only
    sameSite: 'lax' as const, // not sent on cross-site POSTs
    path: '/',
    expires,
  };
}

export async function createSession(data: NewSession) {
  const { token, expires } = await sealSession(data);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)));
}
