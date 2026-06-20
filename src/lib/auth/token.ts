import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

const TOKEN_KEY = 'auth_token';

const SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET ?? 'dev-only-insecure-secret';

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  const ciphertext = AES.encrypt(token, SECRET).toString();
  localStorage.setItem(TOKEN_KEY, ciphertext);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const ciphertext = localStorage.getItem(TOKEN_KEY);
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
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}
