import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import { jwtVerify } from 'jose';
import type { Role } from '@/types/api/auth';

const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET ?? 'dev-only-insecure-secret';
const JWT_KEY = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

export async function getRoleFromCookie(cookie?: string): Promise<Role | null> {
  if (!cookie) return null;
  try {
    const jwt = AES.decrypt(cookie, TOKEN_SECRET).toString(Utf8);
    const { payload } = await jwtVerify(jwt, JWT_KEY, { algorithms: ['HS256'] });
    return payload.role === 'ADMIN' || payload.role === 'USER' ? payload.role : null;
  } catch {
    return null;
  }
}
