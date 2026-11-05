export interface Conversation {
  id: string;
  title: string;
  documentId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageRole = 'USER' | 'ASSISTANT';

export interface Citation {
  score: number;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  documentId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  tokenCount: number;
  createdAt: Date;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface AskStreamPayload {
  question: string;
  conversationId?: string;
  documentId?: string;
  topK?: number;
}

// Server-sent events emitted by POST /ask/stream, in the order they arrive.
export type AskStreamEvent =
  | { event: 'start'; data: { conversationId: string; citations: Citation[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'done'; data: { conversationId: string } }
  | { event: 'error'; data: { status: number; message: string } };
