import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DashboardHeader } from '@/components/features/dashboard/Header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/ui/sidebar/app-sidebar';
import { requireRole } from '@/lib/auth/dal';
import { MEMBER_ROLES } from '@/lib/auth/routes';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import { getServerQueryClient } from '@/lib/react-query/server';

// Member-only area. Admins are redirected to HOME.ADMIN even if the proxy were bypassed.
export default async function UserLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(...MEMBER_ROLES);

  const queryClient = getServerQueryClient();
  queryClient.setQueryData(authQueryKeys.me(), user);

  // Persist the open/collapsed state across reloads (SidebarProvider writes this cookie on toggle).
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </HydrationBoundary>
  );
}
