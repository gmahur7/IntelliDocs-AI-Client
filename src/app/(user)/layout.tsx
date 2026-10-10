import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/features/chat/AppSidebar';
import { ChatHeader } from '@/components/features/chat/ChatHeader';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  // Restore the desktop sidebar's open/collapsed state saved by SidebarProvider.
  const defaultOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset className="h-svh overflow-hidden">
          <ChatHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
