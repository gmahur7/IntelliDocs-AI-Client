'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Composer } from '@/components/features/chat/Composer';
import { MessageList } from '@/components/features/chat/MessageList';
import { useConversation } from '@/hooks/useConversations';
import { sendMessage, stopStream, useLiveTurn } from '@/lib/chat/stream-store';

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-label="Loading conversation">
      <Skeleton className="ml-auto h-10 w-2/5 rounded-3xl" />
      <div className="flex gap-3">
        <Skeleton className="size-7 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    </div>
  );
}

export function ChatView({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useConversation(conversationId);
  const liveTurn = useLiveTurn(conversationId);

  const messages = data?.messages ?? [];
  // Hide the live copy once the refetched thread already contains this turn.
  const visibleLiveTurn = liveTurn && messages.length <= liveTurn.baseCount ? liveTurn : undefined;
  const isStreaming = liveTurn?.status === 'pending' || liveTurn?.status === 'streaming';

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // Follow new content only while the reader is already at the bottom.
  useLayoutEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages.length, visibleLiveTurn?.answer, visibleLiveTurn?.status]);

  useEffect(() => {
    stickToBottom.current = true;
    scrollToBottom();
  }, [conversationId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom);
  }

  function send(question: string) {
    stickToBottom.current = true;
    sendMessage(queryClient, conversationId, question);
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <MessageSquareOff className="size-5 text-muted-foreground" />
        </span>
        <div>
          <h2 className="font-semibold">This chat isn&apos;t available</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Start a new chat</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6">
          {isPending ? (
            <ThreadSkeleton />
          ) : (
            <MessageList messages={messages} liveTurn={visibleLiveTurn} onRetry={send} />
          )}
        </div>
      </div>

      {showJump && (
        <Button
          variant="outline"
          size="icon"
          aria-label="Scroll to latest message"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-md"
        >
          <ArrowDown />
        </Button>
      )}

      <div className="bg-gradient-to-t from-background from-70% to-transparent px-4 pt-2 pb-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            onSubmit={send}
            onStop={() => stopStream(conversationId)}
            isStreaming={isStreaming}
            disabled={isPending}
            placeholder="Ask a follow-up…"
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Answers are generated from your documents and can be inaccurate.
          </p>
        </div>
      </div>
    </div>
  );
}
