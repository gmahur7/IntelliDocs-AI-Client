import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { requireRole } from '@/lib/auth/dal';
import { MEMBER_ROLES } from '@/lib/auth/routes';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import { getServerQueryClient } from '@/lib/react-query/server';

// Member-only area. Admins are redirected to HOME.ADMIN even if the proxy were bypassed.
export default async function UserLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(...MEMBER_ROLES);

  const queryClient = getServerQueryClient();
  queryClient.setQueryData(authQueryKeys.me(), user);

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
