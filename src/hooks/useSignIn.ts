'use client';

import { SignInPayload, User } from '@/types/api/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/http';
import { signInAction } from '@/lib/auth/actions';
import { meQueryOptions } from '@/lib/react-query/queries/auth';
import { HOME } from '@/lib/auth/routes';

export function useSignIn() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<User, ApiError, SignInPayload>({
    mutationFn: async (input: { email: string; password: string }) => {
      const result = await signInAction(input);
      if (!result.ok) throw new ApiError(result.status, result.message);
      return result.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user);
      router.push(HOME[user.role]);
    },
  });
}
