import { ChatView } from '@/components/features/chat/ChatView';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatView key={id} conversationId={id} />;
}
