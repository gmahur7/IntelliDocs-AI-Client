import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

export const TOKEN_KEY = 'auth_token';

const MAX_AGE = 60 * 60 * 24;

const SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET ?? 'dev-only-insecure-secret';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function setToken(token: string): void {
  if (typeof document === 'undefined') return;
  const ciphertext = AES.encrypt(token, SECRET).toString();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(ciphertext)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

export function getToken(): string | null {
  const ciphertext = readCookie(TOKEN_KEY);
  if (!ciphertext) return null;
  try {
    const token = AES.decrypt(ciphertext, SECRET).toString(Utf8);
    return token || null;
  } catch {
    clearToken();
    return null;
  }
}

export function clearToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
