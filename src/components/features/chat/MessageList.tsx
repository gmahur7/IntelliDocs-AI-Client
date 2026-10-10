'use client';

import { FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/features/chat/Brand';
import type { LiveTurn } from '@/lib/chat/stream-store';
import type { Citation, Message } from '@/types/api/conversation';

function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((citation, index) => {
        const pages =
          citation.pageStart == null
            ? null
            : citation.pageEnd && citation.pageEnd !== citation.pageStart
              ? `pp. ${citation.pageStart}–${citation.pageEnd}`
              : `p. ${citation.pageStart}`;
        return (
          <span
            key={citation.chunkId}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
            title={`Document ${citation.documentId}`}
          >
            <FileText className="size-3" />
            Source {index + 1}
            {pages && <span className="opacity-70">· {pages}</span>}
          </span>
        );
      })}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 whitespace-pre-wrap break-words sm:max-w-[75%]">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <BrandMark className="mt-0.5 size-7 rounded-full" />
      <div className="min-w-0 flex-1 pt-0.5 leading-7">{children}</div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-2.5" aria-label="Assistant is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

interface MessageListProps {
  messages: Message[];
  liveTurn?: LiveTurn;
  onRetry: (question: string) => void;
}

export function MessageList({ messages, liveTurn, onRetry }: MessageListProps) {
  return (
    <div className="flex flex-col gap-8">
      {messages.map((message) =>
        message.role === 'USER' ? (
          <UserBubble key={message.id} content={message.content} />
        ) : (
          <AssistantMessage key={message.id}>
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            <Citations citations={message.citations ?? []} />
          </AssistantMessage>
        ),
      )}

      {liveTurn && (
        <>
          <UserBubble content={liveTurn.question} />
          <AssistantMessage>
            {liveTurn.answer ? (
              <div className="whitespace-pre-wrap break-words">
                {liveTurn.answer}
                {liveTurn.status === 'streaming' && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-foreground/70" />
                )}
              </div>
            ) : (
              liveTurn.status !== 'error' && liveTurn.status !== 'stopped' && <TypingIndicator />
            )}
            {liveTurn.status === 'stopped' && (
              <p className="mt-2 text-sm text-muted-foreground italic">Response stopped.</p>
            )}
            {liveTurn.status === 'error' && (
              <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {liveTurn.error || 'Something went wrong.'}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetry(liveTurn.question)}
                  className="ml-auto"
                >
                  <RotateCcw />
                  Retry
                </Button>
              </div>
            )}
            {liveTurn.status !== 'error' && <Citations citations={liveTurn.citations} />}
          </AssistantMessage>
        </>
      )}
    </div>
  );
}
