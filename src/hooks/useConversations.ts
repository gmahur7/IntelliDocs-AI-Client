'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationQueryKeys } from '@/lib/react-query/query-keys';
import {
  askStream,
  conversationQueryOptions,
  conversationWithMessagesQueryOptions,
} from '@/lib/react-query/queries/conversations';
import type { Citation } from '@/types/api/conversations';

export const useGetConversations = () => useQuery(conversationQueryOptions);

export const useGetConversationWithMessages = (conversationId: string) =>
  useQuery(conversationWithMessagesQueryOptions(conversationId));

// The turn currently in flight. It lives outside the query cache until the server has
// persisted it; then the conversation query is refetched and this is cleared.
export type PendingTurn = {
  question: string;
  answer: string;
  citations: Citation[];
  status: 'streaming' | 'error';
  error?: string;
};

type SendOptions = { conversationId: string; documentId?: string };

export function useSendMessage({ conversationId, documentId }: SendOptions) {
  const queryClient = useQueryClient();
  const [turn, setTurn] = useState<PendingTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: conversationQueryKeys.getConversationWithMessages(conversationId),
        }),
        // The first turn generates the title shown in the sidebar.
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.getConversations() }),
      ]),
    [queryClient, conversationId],
  );

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setTurn({ question: trimmed, answer: '', citations: [], status: 'streaming' });

      try {
        const events = askStream(
          { question: trimmed, conversationId, documentId },
          controller.signal,
        );
        for await (const { event, data } of events) {
          if (event === 'start') {
            setTurn((prev) => prev && { ...prev, citations: data.citations });
          } else if (event === 'token') {
            setTurn((prev) => prev && { ...prev, answer: prev.answer + data.text });
          } else if (event === 'error') {
            throw new Error(data.message);
          } else if (event === 'done') {
            break;
          }
        }
        // Keep the streamed turn on screen until the persisted copy is in the cache.
        await refresh();
        setTurn(null);
      } catch (error) {
        if (controller.signal.aborted) {
          // The backend keeps generating after a client disconnect, so the turn may have
          // been saved anyway. Pick up whatever exists.
          await refresh();
          setTurn(null);
          return;
        }
        const message = error instanceof Error ? error.message : 'Something went wrong';
        setTurn((prev) => prev && { ...prev, status: 'error', error: message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [conversationId, documentId, refresh],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const dismiss = useCallback(() => setTurn(null), []);
  const retry = useCallback(() => {
    if (turn?.status === 'error') void send(turn.question);
  }, [turn, send]);

  // Don't leave a stream running after navigating away.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { send, stop, retry, dismiss, turn, isStreaming: turn?.status === 'streaming' };
}
