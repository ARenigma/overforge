'use client';

import * as React from 'react';
import { Link } from 'next-view-transitions';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/marketing/wordmark';
import { BookDemo } from '@/components/marketing/book-demo';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const LINKS = [
  { label: 'Product', href: '/product', desc: 'The FSM, voice loop, sandbox, scorer' },
  { label: 'How it works', href: '/how-it-works', desc: 'A run, state by state' },
  { label: 'Pricing', href: '/pricing', desc: 'Per-interview, no seats' },
] as const;

// The Product dropdown panel — mono spec-keys + one-line descriptors (the together.ai register:
// every nav item earns a descriptor). Hover-intent open, Escape/blur close, full keyboard support.
const PRODUCT_MENU = [
  {
    k: 'system',
    label: 'Product overview',
    href: '/product',
    desc: 'Six modules, one deterministic interviewer',
  },
  { k: 'states', label: 'How it works', href: '/how-it-works', desc: 'A real run, state by state' },
  {
    k: 'sandbox',
    label: 'Isolation spec',
    href: '/#security',
    desc: 'gVisor, no network, destroyed on exit',
  },
  {
    k: 'receipt',
    label: 'The audit ledger',
    href: '/how-it-works#artifact',
    desc: 'Every session leaves a machine-readable receipt',
  },
] as const;

function ProductDropdown() {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  return (
    <div
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        // Open-only: hover already opened it for mouse users, so a toggle would close the panel
        // on the very click that follows the hover. Escape / mouseleave / blur close it.
        onClick={openNow}
        className={cn(
          'flex items-center gap-1 px-3 py-2 text-sm transition-colors duration-fast ease-out-cubic focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          open ? 'text-primary' : 'text-foreground-subtle hover:text-primary'
        )}
      >
        Product
        <svg
          viewBox="0 0 10 6"
          className={cn(
            'h-1.5 w-2.5 transition-transform duration-fast ease-out-cubic',
            open && 'rotate-180'
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full w-[440px] -translate-x-1/2 pt-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-fast">
          <div className="overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-[0_8px_16px_-8px_rgba(0,0,0,0.2),0_24px_48px_-16px_rgba(0,0,0,0.25)]">
            {PRODUCT_MENU.map((item) => (
              <Link
                key={item.k}
                href={item.href}
                onClick={() => setOpen(false)}
                className="group/item flex items-baseline gap-4 rounded-md px-3.5 py-2.5 transition-colors duration-fast ease-out-cubic hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                  {item.k}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="mt-0.5 text-xs text-foreground-subtle">{item.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Site nav — transparent over the hero, frosting to a hairline-bordered bar on scroll (Supabase's
 *  one-canvas rule: the nav never introduces a second background color at rest). Full-width, h-16. */
export function SiteNav() {
  const [open, setOpen] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const accountHref = authed ? '/dashboard' : '/auth';
  const accountLabel = authed ? 'Dashboard' : 'Sign in';

  return (
    <>
      {/* Page-long grid rules — the max-w-6xl container edges drawn top to bottom on every
          marketing page (together.ai's page grid). Hairline, behind the nav, above the canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-30 hidden w-full max-w-6xl -translate-x-1/2 border-x border-border/50 lg:block"
      />
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-colors duration-base ease-out-cubic',
          scrolled
            ? 'border-b border-border bg-background/80 backdrop-blur-md'
            : 'border-b border-transparent'
        )}
      >
        <nav
          aria-label="Primary"
          className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6 sm:px-8"
        >
          <Link href="/" aria-label="Finite — home" className="shrink-0">
            <Wordmark />
          </Link>

          {/* TRULY centered — absolutely positioned so uneven side clusters can never tilt it. */}
          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex">
            <ProductDropdown />
            <Link
              href="/how-it-works"
              className="px-3 py-2 text-sm text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-primary"
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="px-3 py-2 text-sm text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-primary"
            >
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <BookDemo variant="outline" className="hidden h-9 px-4 lg:inline-flex">
              Book a pilot
            </BookDemo>
            <Link
              href={accountHref}
              className="hidden text-sm text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-foreground sm:inline-flex"
            >
              {accountLabel}
            </Link>
            <Link
              href="/auth"
              className="hidden h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity duration-fast ease-out-cubic hover:opacity-90 sm:inline-flex"
            >
              Start free
            </Link>
            <button
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-foreground md:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>

        {open && (
          <div className="border-t border-border bg-background/95 backdrop-blur-md md:hidden">
            <div className="mx-auto max-w-6xl px-6 py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
                >
                  <span className="block text-sm text-foreground">{l.label}</span>
                  <span className="block font-mono text-[11px] text-foreground-subtle">
                    {l.desc}
                  </span>
                </Link>
              ))}
              <Link
                href={accountHref}
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-md bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                {accountLabel}
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
