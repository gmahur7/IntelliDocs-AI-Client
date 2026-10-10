'use client';

import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import http from '@/lib/http';
import { getToken } from '@/lib/auth/token';
import { conversationQueryKeys } from '@/lib/react-query/query-keys';
import type { AskStreamEvent, Citation, ConversationDetail } from '@/types/api/conversation';

// The in-flight turn of a conversation, kept outside React so a stream survives navigation
// (e.g. switching chats mid-answer) and is never started twice by StrictMode effects.
export interface LiveTurn {
  question: string;
  answer: string;
  citations: Citation[];
  status: 'pending' | 'streaming' | 'stopped' | 'error';
  error?: string;
  // Persisted message count when the turn started; once the server copy exceeds it, the
  // persisted messages already contain this turn and the live copy is hidden.
  baseCount: number;
}

const turns = new Map<string, LiveTurn>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function update(id: string, patch: Partial<LiveTurn> | null) {
  const current = turns.get(id);
  if (patch === null) turns.delete(id);
  else if (current) turns.set(id, { ...current, ...patch });
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveTurn(conversationId: string): LiveTurn | undefined {
  return useSyncExternalStore(
    subscribe,
    () => turns.get(conversationId),
    () => undefined,
  );
}

export function isStreaming(conversationId: string): boolean {
  return controllers.has(conversationId);
}

export function stopStream(conversationId: string) {
  controllers.get(conversationId)?.abort();
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AskStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = '';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (event && data) yield { event, data: JSON.parse(data) } as AskStreamEvent;
    }
  }
}

export function sendMessage(queryClient: QueryClient, conversationId: string, question: string) {
  if (controllers.has(conversationId)) return;

  const detailKey = conversationQueryKeys.detail(conversationId);
  const baseCount = queryClient.getQueryData<ConversationDetail>(detailKey)?.messages.length ?? 0;
  const controller = new AbortController();
  controllers.set(conversationId, controller);
  turns.set(conversationId, {
    question,
    answer: '',
    citations: [],
    status: 'pending',
    baseCount,
  });
  update(conversationId, {});

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey }),
      queryClient.invalidateQueries({ queryKey: conversationQueryKeys.list() }),
    ]);

  void (async () => {
    try {
      const response = await fetch(`${http.defaults.baseURL}/ask/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({ question, conversationId }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || body?.message || 'Something went wrong');
      }

      let answer = '';
      for await (const { event, data } of readEvents(response.body)) {
        if (event === 'start') {
          update(conversationId, { citations: data.citations, status: 'streaming' });
        } else if (event === 'token') {
          answer += data.text;
          update(conversationId, { answer, status: 'streaming' });
        } else if (event === 'error') {
          throw new Error(data.message);
        }
      }

      controllers.delete(conversationId);
      await refresh();
      update(conversationId, null);
    } catch (error) {
      controllers.delete(conversationId);
      const aborted = controller.signal.aborted;
      update(conversationId, {
        status: aborted ? 'stopped' : 'error',
        error: aborted ? undefined : (error as Error).message,
      });
      await refresh();
    }
  })();
}
