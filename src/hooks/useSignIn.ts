'use client';

import http from '@/lib/http';
import { setToken } from '@/lib/auth/token';
import { ApiResponse } from '@/types/api/api';
import { AuthError, AuthResponse, SignInPayload } from '@/types/api/auth';
import { useMutation } from '@tanstack/react-query';

export function useSignIn() {
  return useMutation<AuthResponse, AuthError, SignInPayload>({
    mutationFn: async ({ email, password }) => {
      const response = await http.post<ApiResponse<AuthResponse>>('/auth/sign-in', {
        email,
        password,
      });
      if (!response.data.isSuccess) {
        throw new Error(response.data.error?.message || 'Failed to sign in');
      }
      return response.data.data;
    },
    onSuccess: (data) => {
      setToken(data.token);
    },
  });
}
