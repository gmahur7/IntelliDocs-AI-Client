'use client';

import http from '@/lib/http';
import { clearToken } from '@/lib/auth/token';
import { authQuerykeys } from '@/lib/react-query/query-keys';
import { ApiResponse } from '@/types/api/api';
import { AuthUser } from '@/types/api/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useMe() {
  return useQuery({
    queryKey: authQuerykeys.me(),
    queryFn: async () => {
      const response = await http.get<ApiResponse<{ user: AuthUser }>>('/auth/me');
      if (!response.data.isSuccess) {
        throw new Error(response.data.error?.message || 'Failed to load profile');
      }
      return response.data.data.user;
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    // The token is dropped locally even if the server call fails.
    mutationFn: () => http.post('/auth/sign-out').catch(() => undefined),
    onSettled: () => {
      clearToken();
      queryClient.clear();
      // Full reload so the proxy re-evaluates and no cached page survives sign-out.
      window.location.assign('/sign-in');
    },
  });
}
