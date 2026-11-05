'use client';

import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  FileText,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGetConversationWithMessages,
  useSendMessage,
  type PendingTurn,
} from '@/hooks/useConversations';
import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/api/conversations';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatTime = (value: Date | string) => timeFormat.format(new Date(value));
const formatDate = (value: Date | string) => dateFormat.format(new Date(value));

const pageLabel = ({ pageStart, pageEnd }: Citation) =>
  pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}–${pageEnd}`;

function initialsOf(firstName?: string, lastName?: string) {
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  return initials || 'U';
}

function Timestamp({ value }: { value: Date | string }) {
  return (
    <time
      dateTime={new Date(value).toISOString()}
      className="px-1 text-[11px] text-muted-foreground"
    >
      {formatTime(value)}
    </time>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  // Sort by relevance (lower score = closer match), then de-duplicate identical page ranges.
  const unique = new Map<string, Citation>();
  for (const citation of [...citations].sort((a, b) => a.score - b.score)) {
    const key = `${citation.pageStart}-${citation.pageEnd}`;
    if (!unique.has(key)) unique.set(key, citation);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Sources
      </span>
      {[...unique.values()].map((citation) => (
        <span
          key={citation.chunkId}
          title={`Chunk ${citation.chunkId}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <FileText className="size-3" aria-hidden />
          {pageLabel(citation)}
        </span>
      ))}
    </div>
  );
}

function UserBubble({
  content,
  initials,
  createdAt,
}: {
  content: string;
  initials: string;
  createdAt?: Date | string;
}) {
  return (
    <div className="flex items-end justify-end gap-3">
      <div className="flex max-w-[80%] flex-col items-end gap-1 sm:max-w-[70%]">
        <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-sm">
          {content}
        </div>
        {createdAt && <Timestamp value={createdAt} />}
      </div>
      <Avatar size="sm" className={cn(createdAt && 'mb-5')}>
        <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

function AssistantBubble({
  content,
  citations,
  createdAt,
  streaming = false,
  footer,
}: {
  content: string;
  citations?: Citation[] | null;
  createdAt?: Date | string;
  streaming?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted',
          streaming && 'animate-pulse',
        )}
      >
        <Sparkles className="size-3.5 text-foreground" aria-hidden />
      </div>
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-card-foreground shadow-sm">
          {content}
          {streaming && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-foreground/70"
            />
          )}
          {streaming && !content && <span className="text-muted-foreground">Thinking…</span>}
          {citations && citations.length > 0 && <Citations citations={citations} />}
          {footer}
        </div>
        {createdAt && <Timestamp value={createdAt} />}
      </div>
    </div>
  );
}

function PendingTurnView({
  turn,
  initials,
  onRetry,
  onDismiss,
}: {
  turn: PendingTurn;
  initials: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = turn.status === 'error';
  return (
    <>
      <UserBubble content={turn.question} initials={initials} />
      <AssistantBubble
        content={turn.answer}
        citations={turn.citations}
        streaming={!failed}
        footer={
          failed && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              <span className="text-xs text-destructive">{turn.error}</span>
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="xs" onClick={onRetry}>
                  <RefreshCw aria-hidden />
                  Retry
                </Button>
                <Button variant="ghost" size="xs" onClick={onDismiss} aria-label="Dismiss">
                  <X aria-hidden />
                </Button>
              </div>
            </div>
          )
        }
      />
    </>
  );
}

function Composer({
  onSend,
  onStop,
  isStreaming,
}: {
  onSend: (question: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !isStreaming;

  // Grow with the content, up to a few lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
    textareaRef.current?.focus();
  };

  return (
    <div className="sticky bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-background/0 pt-6 pb-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl px-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask a question about this document…"
            aria-label="Message"
            className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground"
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message">
              <ArrowUp aria-hidden />
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Enter to send · Shift + Enter for a new line
        </p>
      </form>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-1/2 rounded-2xl" />
      </div>
      <div className="flex items-start gap-3">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-28 w-3/4 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-1/3 rounded-2xl" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" aria-hidden />
        </div>
        <p className="text-sm font-medium">Couldn’t load this conversation</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw className="size-3.5" aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium">No messages yet</p>
      <p className="text-sm text-muted-foreground">Ask a question to start the conversation.</p>
    </div>
  );
}

const NEAR_BOTTOM_PX = 160;

const Page = (): React.ReactElement => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { data, isPending, isError, error, refetch } =
    useGetConversationWithMessages(conversationId);
  const { data: user } = useMe();
  const { send, stop, retry, dismiss, turn, isStreaming } = useSendMessage({
    conversationId,
    documentId: data?.conversation.documentId,
  });

  const endRef = useRef<HTMLDivElement>(null);
  const messageCount = data?.messages.length ?? 0;

  // Jump to the bottom when a turn starts; while tokens stream, follow only if the reader
  // is already near the bottom so they can scroll up to re-read without being yanked back.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turn?.question, messageCount]);

  useEffect(() => {
    if (!turn?.answer) return;
    const { scrollHeight } = document.documentElement;
    const distance = scrollHeight - window.innerHeight - window.scrollY;
    if (distance < NEAR_BOTTOM_PX) endRef.current?.scrollIntoView({ block: 'end' });
  }, [turn?.answer]);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  const { conversation, messages } = data;
  const initials = initialsOf(user?.firstName, user?.lastName);
  const total = messages.length + (turn ? 1 : 0);
  const isEmpty = messages.length === 0 && !turn;

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-4">
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {conversation.title}
          </h1>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Started {formatDate(conversation.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>
              {total} {total === 1 ? 'message' : 'messages'}
            </span>
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {isEmpty ? (
          <EmptyState />
        ) : (
          messages.map((message) =>
            message.role === 'USER' ? (
              <UserBubble
                key={message.id}
                content={message.content}
                initials={initials}
                createdAt={message.createdAt}
              />
            ) : (
              <AssistantBubble
                key={message.id}
                content={message.content}
                citations={message.citations}
                createdAt={message.createdAt}
              />
            ),
          )
        )}
        {turn && (
          <PendingTurnView turn={turn} initials={initials} onRetry={retry} onDismiss={dismiss} />
        )}
        <div ref={endRef} aria-hidden />
      </div>

      <Composer
        onSend={(question) => void send(question)}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </div>
  );
};

export default Page;
