'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComposerProps {
  onSubmit: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

export function Composer({
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  autoFocus = false,
  placeholder = 'Ask anything about your documents…',
  className,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim());
    setValue('');
    textareaRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        'flex w-full items-end gap-2 rounded-3xl border bg-card p-2 pl-4 shadow-sm transition-shadow focus-within:border-ring/60 focus-within:shadow-md',
        className,
      )}
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={textareaRef}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="field-sizing-content max-h-52 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60 md:text-sm"
      />
      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          onClick={onStop}
          aria-label="Stop generating"
          className="rounded-full"
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          aria-label="Send message"
          className="rounded-full"
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </form>
  );
}
