'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FileSearch, Lightbulb, ListChecks, ScrollText, type LucideIcon } from 'lucide-react';
import { Composer } from '@/components/features/chat/Composer';
import { useCreateConversation } from '@/hooks/useConversations';
import { useMe } from '@/hooks/useAuthUser';
import { sendMessage } from '@/lib/chat/stream-store';

const SUGGESTIONS: { icon: LucideIcon; title: string; prompt: string }[] = [
  {
    icon: ScrollText,
    title: 'Summarize my documents',
    prompt: 'Give me a concise summary of my uploaded documents.',
  },
  {
    icon: FileSearch,
    title: 'Find the key facts',
    prompt: 'What are the most important facts and figures in my documents?',
  },
  {
    icon: Lightbulb,
    title: 'Explain it simply',
    prompt: 'Explain the main ideas in my documents in simple terms.',
  },
  {
    icon: ListChecks,
    title: 'Draft action items',
    prompt: 'Turn the key points in my documents into a list of action items.',
  },
];

const noopSubscribe = () => () => {};

// Read the hour on the client only; the server's clock/time zone would mismatch on hydration.
function useGreeting() {
  const hour = useSyncExternalStore(
    noopSubscribe,
    () => new Date().getHours(),
    () => null,
  );
  if (hour === null) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const greeting = useGreeting();
  const createConversation = useCreateConversation();

  function start(question: string) {
    createConversation.mutate(undefined, {
      onSuccess: (conversation) => {
        sendMessage(queryClient, conversation.id, question);
        router.push(`/c/${conversation.id}`);
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="animate-in fade-in slide-in-from-bottom-2 text-center duration-500">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting}
            {user?.firstName && <span className="text-muted-foreground">, {user.firstName}</span>}
          </h1>
          <p className="mt-2 text-muted-foreground">
            What would you like to know about your documents today?
          </p>
        </div>

        <div className="w-full">
          <Composer
            autoFocus
            onSubmit={start}
            disabled={createConversation.isPending}
            className="p-3 pl-5"
          />
          {createConversation.isError && (
            <p className="mt-2 px-2 text-sm text-destructive" role="alert">
              {createConversation.error.message}
            </p>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
            <button
              key={title}
              type="button"
              disabled={createConversation.isPending}
              onClick={() => start(prompt)}
              className="group flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-left transition-all outline-none hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{prompt}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
