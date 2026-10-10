'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Search,
  SquarePen,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useConversations, useDeleteConversation } from '@/hooks/useConversations';
import { useMe, useSignOut } from '@/hooks/useAuthUser';
import { APP_NAME, BrandMark } from '@/components/features/chat/Brand';
import type { Conversation } from '@/types/api/conversation';

const DAY = 24 * 60 * 60 * 1000;
// Fixed widths: shadcn's SidebarMenuSkeleton uses Math.random(), which breaks hydration.
const SKELETON_WIDTHS = ['72%', '58%', '84%', '66%', '76%', '52%'];

function groupByRecency(conversations: Conversation[]) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Previous 30 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const conversation of conversations) {
    const time = new Date(conversation.updatedAt).getTime();
    const index =
      time >= startOfToday
        ? 0
        : time >= startOfToday - DAY
          ? 1
          : time >= startOfToday - 7 * DAY
            ? 2
            : time >= startOfToday - 30 * DAY
              ? 3
              : 4;
    groups[index].items.push(conversation);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function AppSidebar() {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState('');

  // ChatGPT-style shortcut: ⌘/Ctrl + Shift + O starts a new chat.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        router.push('/');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2 px-2 pt-1">
          <BrandMark />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-9 border bg-background shadow-xs hover:bg-accent"
              onClick={() => setOpenMobile(false)}
            >
              <Link href="/">
                <SquarePen />
                <span className="font-medium">New chat</span>
                <kbd className="ml-auto hidden font-sans text-[10px] text-muted-foreground md:inline">
                  ⇧⌘O
                </kbd>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ConversationHistory query={query} />
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ConversationHistory({ query }: { query: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { data, isPending, isError, refetch } = useConversations();
  const deleteConversation = useDeleteConversation();
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (data ?? []).filter(
      (c) => !needle || (c.title ?? 'New chat').toLowerCase().includes(needle),
    );
    return groupByRecency(filtered);
  }, [data, query]);

  if (isPending) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Recent</SidebarGroupLabel>
        <SidebarMenu>
          {SKELETON_WIDTHS.map((width, i) => (
            <SidebarMenuItem key={i} className="flex h-8 items-center px-2">
              <Skeleton className="h-4" style={{ width }} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-3 text-sm text-muted-foreground">
        Couldn&apos;t load your chats.
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {query ? 'No chats match your search.' : 'No conversations yet. Start one!'}
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((conversation) => {
                const href = `/c/${conversation.id}`;
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Link href={href} title={conversation.title ?? 'New chat'}>
                        <span className="truncate">{conversation.title ?? 'New chat'}</span>
                      </Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label="Chat options">
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(conversation)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title ?? 'New chat'}&rdquo; and all of its messages will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteConversation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingDelete) return;
                const { id } = pendingDelete;
                deleteConversation.mutate(id, {
                  onSuccess: () => {
                    setPendingDelete(null);
                    if (pathname === `/c/${id}`) router.push('/');
                  },
                });
              }}
            >
              {deleteConversation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
          {deleteConversation.isError && (
            <p className="text-sm text-destructive">{deleteConversation.error.message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UserMenu() {
  const { data: user, isPending } = useMe();
  const { theme, setTheme } = useTheme();
  const signOut = useSignOut();

  const name = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials || '·'}
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">
                  {name || (isPending ? 'Loading…' : 'Account')}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="dark:hidden" />
                <Moon className="hidden dark:block" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun /> Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon /> Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
              <LogOut />
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
