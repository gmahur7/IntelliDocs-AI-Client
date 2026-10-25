'use client';

import { signUpAction } from '@/lib/auth/actions';
import { HOME } from '@/lib/auth/routes';
import { ApiError } from '@/lib/http';
import { meQueryOptions } from '@/lib/react-query/queries/auth';
import { SignUpPayload, User } from '@/types/api/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function useSignUp() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<User, ApiError, SignUpPayload>({
    mutationFn: async (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      const result = await signUpAction(input);
      if (!result.ok) throw new ApiError(result.status, result.message);
      return result.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user);
      router.push(HOME[user.role]);
    },
  });
}
