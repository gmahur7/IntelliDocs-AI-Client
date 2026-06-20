import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Variant definitions
// ---------------------------------------------------------------------------

const typographyVariants = cva('', {
  variants: {
    /**
     * Semantic / visual role of the text.
     * Each variant ships with responsive size scaling out of the box.
     */
    variant: {
      // ── Headings (font-heading → Geist Sans via CSS var) ──────────────────
      h1: ['scroll-m-20 font-heading font-bold tracking-tight', 'text-4xl sm:text-5xl lg:text-6xl'],
      h2: ['scroll-m-20 font-heading font-semibold tracking-tight', 'text-3xl sm:text-4xl'],
      h3: ['scroll-m-20 font-heading font-semibold tracking-tight', 'text-2xl sm:text-3xl'],
      h4: ['scroll-m-20 font-heading font-semibold tracking-tight', 'text-xl sm:text-2xl'],
      h5: ['scroll-m-20 font-heading font-medium tracking-tight', 'text-lg sm:text-xl'],
      h6: ['scroll-m-20 font-heading font-medium tracking-tight', 'text-base sm:text-lg'],
      // ── Body copy ─────────────────────────────────────────────────────────
      bodyLarge: 'text-lg leading-8 sm:text-xl',
      body: 'text-base leading-7',
      bodySmall: 'text-sm leading-6',
      // ── Display / editorial ───────────────────────────────────────────────
      lead: 'text-lg leading-8 text-muted-foreground sm:text-xl',
      display: [
        'scroll-m-20 font-heading font-extrabold tracking-tighter',
        'text-5xl sm:text-6xl lg:text-7xl xl:text-8xl',
      ],
      // ── Supporting / meta ─────────────────────────────────────────────────
      overline: 'text-xs font-semibold uppercase tracking-widest text-muted-foreground',
      caption: 'text-xs leading-4 text-muted-foreground',
      label: 'text-sm font-medium leading-none',
      muted: 'text-sm leading-6 text-muted-foreground',
      // ── Inline / code ─────────────────────────────────────────────────────
      code: 'relative rounded-sm bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
      blockquote: 'border-l-2 border-border pl-6 italic text-muted-foreground',
      // ── UI chrome ─────────────────────────────────────────────────────────
      button: 'text-sm font-medium leading-none',
    },

    /**
     * Explicit font-size override — applied on top of (and overrides) variant size.
     * Use when you need a variant's styling but a different scale.
     */
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
      '7xl': 'text-7xl',
      '8xl': 'text-8xl',
    },

    /** Font-weight override. */
    weight: {
      thin: 'font-thin',
      extralight: 'font-extralight',
      light: 'font-light',
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
      extrabold: 'font-extrabold',
      black: 'font-black',
    },

    /** Text alignment. */
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
      start: 'text-start',
      end: 'text-end',
    },

    /**
     * Semantic color using shadcn CSS variable tokens.
     * Respects light/dark mode automatically.
     */
    color: {
      default: 'text-foreground',
      primary: 'text-primary',
      secondary: 'text-secondary-foreground',
      muted: 'text-muted-foreground',
      accent: 'text-accent-foreground',
      destructive: 'text-destructive',
      inherit: 'text-inherit',
    },

    /** Line-height override. */
    leading: {
      none: 'leading-none',
      tight: 'leading-tight',
      snug: 'leading-snug',
      normal: 'leading-normal',
      relaxed: 'leading-relaxed',
      loose: 'leading-loose',
    },

    /** Letter-spacing override. */
    tracking: {
      tighter: 'tracking-tighter',
      tight: 'tracking-tight',
      normal: 'tracking-normal',
      wide: 'tracking-wide',
      wider: 'tracking-wider',
      widest: 'tracking-widest',
    },

    /** Text transform. */
    transform: {
      uppercase: 'uppercase',
      lowercase: 'lowercase',
      capitalize: 'capitalize',
      normal: 'normal-case',
    },

    /** Text decoration. */
    decoration: {
      underline: 'underline underline-offset-4',
      'line-through': 'line-through',
      none: 'no-underline',
    },

    /**
     * Clamp visible lines with `overflow: hidden`.
     * Great for truncating card descriptions.
     */
    clamp: {
      1: 'line-clamp-1',
      2: 'line-clamp-2',
      3: 'line-clamp-3',
      4: 'line-clamp-4',
      5: 'line-clamp-5',
      6: 'line-clamp-6',
    },

    /**
     * `text-wrap: balance` — distributes line lengths evenly.
     * Ideal for short headings.
     */
    balance: {
      true: 'text-balance',
    },

    /**
     * `text-wrap: pretty` — avoids orphaned words on the last line.
     * Ideal for body paragraphs.
     */
    pretty: {
      true: 'text-pretty',
    },

    /** Single-line truncation with ellipsis. */
    truncate: {
      true: 'truncate',
    },

    /**
     * Full font-style control.
     * - `italic`  → font-style: italic
     * - `oblique` → font-style: oblique  (slanted without a true italic cut)
     * - `normal`  → font-style: normal   (reset any inherited italic)
     *
     * For the common case of just turning italic on, the boolean `italic` prop
     * is a convenient shorthand — both can coexist, `italic` prop wins on clash.
     */
    fontStyle: {
      italic: 'italic',
      oblique: '[font-style:oblique]',
      normal: 'not-italic',
    },

    /** Shorthand boolean — equivalent to fontStyle="italic". */
    italic: {
      true: 'italic',
    },

    /** Switch to the monospace font (Geist Mono). */
    mono: {
      true: 'font-mono',
    },

    /** Visually hide but keep accessible to screen readers. */
    srOnly: {
      true: 'sr-only',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

// ---------------------------------------------------------------------------
// Semantic element map
// ---------------------------------------------------------------------------

const defaultElementMap = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  bodyLarge: 'p',
  body: 'p',
  bodySmall: 'p',
  lead: 'p',
  overline: 'span',
  caption: 'span',
  label: 'span',
  muted: 'p',
  code: 'code',
  blockquote: 'blockquote',
  button: 'span',
} as const satisfies Record<
  NonNullable<VariantProps<typeof typographyVariants>['variant']>,
  keyof React.JSX.IntrinsicElements
>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypographyVariant = NonNullable<VariantProps<typeof typographyVariants>['variant']>;

type TypographyProps = VariantProps<typeof typographyVariants> & {
  /**
   * Override the rendered HTML element while keeping the variant's styles.
   * e.g. `<Typography variant="h2" as="div">` renders a div styled as h2.
   * Ignored when `asChild` is true.
   */
  as?: keyof React.JSX.IntrinsicElements;
  /**
   * Merge props and styles into the immediate child element.
   * The child must accept `className` and forward refs.
   */
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'color'>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function Typography({
  variant = 'body',
  size,
  weight,
  align,
  color,
  leading,
  tracking,
  transform,
  decoration,
  clamp,
  balance,
  pretty,
  truncate,
  fontStyle,
  italic,
  mono,
  srOnly,
  as,
  asChild = false,
  className,
  children,
  ...props
}: TypographyProps) {
  const Comp: React.ElementType = asChild
    ? Slot.Root
    : (as ?? defaultElementMap[variant as TypographyVariant] ?? 'span');

  return (
    <Comp
      data-slot="typography"
      data-variant={variant}
      className={cn(
        typographyVariants({
          variant,
          size,
          weight,
          align,
          color,
          leading,
          tracking,
          transform,
          decoration,
          clamp,
          balance,
          pretty,
          truncate,
          fontStyle,
          italic,
          mono,
          srOnly,
        }),
        className,
      )}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Comp>
  );
}

export { Typography, typographyVariants };
export type { TypographyProps, TypographyVariant };
