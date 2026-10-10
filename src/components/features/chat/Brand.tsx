import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export const APP_NAME = 'Assistant';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
    >
      <Sparkles className="size-4" />
    </span>
  );
}
