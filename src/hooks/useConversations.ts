'use client';

import http from '@/lib/http';
import { conversationQueryKeys } from '@/lib/react-query/query-keys';
import { ApiResponse } from '@/types/api/api';
import { Conversation, ConversationDetail } from '@/types/api/conversation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

function unwrap<T>(response: { data: ApiResponse<T> }, fallback: string): T {
  if (!response.data.isSuccess) {
    throw new Error(response.data.error?.message || fallback);
  }
  return response.data.data;
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const response = await http.get<ApiResponse<ConversationDetail>>(`/conversations/${id}`);
  return unwrap(response, 'Failed to load conversation');
}

export function useConversations() {
  return useQuery({
    queryKey: conversationQueryKeys.list(),
    queryFn: async () => {
      const response = await http.get<ApiResponse<Conversation[]>>('/conversations');
      return unwrap(response, 'Failed to load conversations');
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationQueryKeys.detail(id),
    queryFn: () => fetchConversation(id),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await http.post<ApiResponse<Conversation>>('/conversations', {});
      return unwrap(response, 'Failed to start a new chat');
    },
    onSuccess: (conversation) => {
      // Seed the empty thread so the chat page renders without a loading state.
      queryClient.setQueryData<ConversationDetail>(conversationQueryKeys.detail(conversation.id), {
        conversation,
        messages: [],
      });
      queryClient.setQueryData<Conversation[]>(conversationQueryKeys.list(), (list) =>
        list ? [conversation, ...list] : list,
      );
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await http.delete<ApiResponse<{ id: string }>>(`/conversations/${id}`);
      return unwrap(response, 'Failed to delete conversation');
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData<Conversation[]>(conversationQueryKeys.list(), (list) =>
        list?.filter((c) => c.id !== id),
      );
      queryClient.removeQueries({ queryKey: conversationQueryKeys.detail(id) });
    },
  });
}
