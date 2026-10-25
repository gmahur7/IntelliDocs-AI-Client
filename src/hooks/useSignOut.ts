'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/lib/auth/actions';
import { LOGIN_PATH } from '@/lib/auth/routes';

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: signOutAction,
    onSettled: () => {
      queryClient.clear();
      router.push(LOGIN_PATH);
      router.refresh();
    },
  });
}
