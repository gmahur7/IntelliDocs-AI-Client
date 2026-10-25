'use server';

import { signInSchema, signUpPayloadSchema } from '../validators/auth';
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
