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
