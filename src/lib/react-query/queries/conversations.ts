import { queryOptions } from '@tanstack/react-query';
import { conversationQueryKeys } from '../query-keys';
import http from '@/lib/http';
import { ApiSuccess } from '@/types/api/api';
import { postSse, readSse } from '@/lib/sse';
import {
  AskStreamEvent,
  AskStreamPayload,
  Conversation,
  ConversationWithMessages,
} from '@/types/api/conversations';

export const conversationQueryOptions = queryOptions({
  queryKey: conversationQueryKeys.getConversations(),
  queryFn: async () => {
    const { data } =
      await http.get<ApiSuccess<{ conversations: Conversation[] }>>('/conversations');
    return data.data;
  },
});

export const conversationWithMessagesQueryOptions = (conversationId: string) =>
  queryOptions({
    queryKey: conversationQueryKeys.getConversationWithMessages(conversationId),
    queryFn: async () => {
      const { data } = await http.get<ApiSuccess<ConversationWithMessages>>(
        `/conversations/${conversationId}`,
      );
      return data.data;
    },
    enabled: Boolean(conversationId),
  });

const STREAM_EVENTS = new Set<AskStreamEvent['event']>(['start', 'token', 'done', 'error']);

// Yields typed events from POST /ask/stream. Unknown event names are skipped.
export async function* askStream(
  payload: AskStreamPayload,
  signal?: AbortSignal,
): AsyncGenerator<AskStreamEvent> {
  const body = await postSse('/ask/stream', payload, signal);
  for await (const { event, data } of readSse(body)) {
    if (!STREAM_EVENTS.has(event as AskStreamEvent['event'])) continue;
    yield { event, data: JSON.parse(data) } as AskStreamEvent;
  }
}
