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
        className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 sm:px-8"
      >
        <Link href="/" aria-label="Finite — home" className="shrink-0">
          <Wordmark />
        </Link>

        {/* TRULY centered — absolutely positioned so uneven side clusters can never tilt it.
            Rounded hover pills (never a square highlight on a non-square item). */}
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <BookDemo variant="outline" className="hidden h-9 px-4 lg:inline-flex">
            Book a pilot
          </BookDemo>
          {/* The one filled CTA — Sign in (or Dashboard when authed); together.ai's SIGN IN slot. */}
          <Link
            href={accountHref}
            className="hidden h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity duration-fast ease-out-cubic hover:opacity-90 sm:inline-flex"
          >
            {accountLabel}
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground-subtle transition-colors duration-fast ease-out-cubic hover:text-foreground md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-md md:hidden">
          <div className="mx-auto max-w-7xl px-6 py-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <span className="block text-sm text-foreground">{l.label}</span>
                <span className="block font-mono text-[11px] text-foreground-subtle">{l.desc}</span>
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
  );
}
