import { ApiResponse } from './api';

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

export interface AuthResponse extends ApiResponse<{
  token: string;
  user: { id: string; email: string; name: string };
}> {
  token: string;
  user: { id: string; email: string; name: string };
}

export interface AuthError extends ApiResponse<never> {
  isSuccess: false;
  message: string;
  statusCode: number;
}
