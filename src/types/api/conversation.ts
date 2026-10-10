export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

// Server-sent events emitted by POST /ask/stream, in order: start → token* → done | error.
export type AskStreamEvent =
  | { event: 'start'; data: { conversationId: string; citations: Citation[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'done'; data: { conversationId: string } }
  | { event: 'error'; data: { status: number; message: string } };
