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
