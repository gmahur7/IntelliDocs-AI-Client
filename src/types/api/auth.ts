import { ApiResponse } from './api';

export type Role = 'ADMIN' | 'USER';

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignOutPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export interface AuthResponse extends ApiResponse<{
  token: string;
  user: AuthUser;
}> {
  token: string;
  user: AuthUser;
}

export interface AuthError extends ApiResponse<never> {
  isSuccess: false;
  message: string;
  statusCode: number;
}
