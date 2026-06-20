import http from '@/lib/http';
import { ApiResponse } from '@/types/api/api';
import { AuthError, AuthResponse, SignUpPayload } from '@/types/api/auth';
import { useMutation } from '@tanstack/react-query';

export function useSignUp() {
  return useMutation<AuthResponse, AuthError, SignUpPayload>({
    mutationFn: async ({ email, password, firstName, lastName }) => {
      const response = await http.post<ApiResponse<AuthResponse>>('/auth/sign-up', {
        email,
        password,
        firstName,
        lastName,
      });
      if (!response?.data?.isSuccess) {
        throw new Error(response?.data?.error?.message || 'Failed to sign up');
      }
      return response.data.data;
    },
  });
}
