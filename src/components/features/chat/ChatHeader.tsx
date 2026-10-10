'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { APP_NAME } from '@/components/features/chat/Brand';
import { useConversations } from '@/hooks/useConversations';

export function ChatHeader() {
  const pathname = usePathname();
  const { data } = useConversations();
  const conversationId = pathname.startsWith('/c/') ? pathname.slice(3) : null;
  const conversation = conversationId ? data?.find((c) => c.id === conversationId) : undefined;
  const title = conversationId ? (conversation?.title ?? 'New chat') : APP_NAME;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:border-transparent">
      <SidebarTrigger />
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
      <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="New chat">
        <Link href="/">
          <SquarePen />
        </Link>
      </Button>
    </header>
  );
}
