import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { requireRole } from '@/lib/auth/dal';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import { getServerQueryClient } from '@/lib/react-query/server';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('ADMIN');

  const queryClient = getServerQueryClient();
  queryClient.setQueryData(authQueryKeys.me(), user);

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
