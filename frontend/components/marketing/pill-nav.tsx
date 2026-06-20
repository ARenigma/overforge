'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/marketing/wordmark';
import { EASE, DUR } from '@/lib/motion';

const LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export function PillNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Primary"
        className={cn(
          'flex w-full max-w-3xl items-center justify-between gap-2 rounded-full',
          'border border-border/80 bg-card/70 px-2 py-2 pl-4 backdrop-blur-xl',
          'supports-[backdrop-filter]:bg-card/60'
        )}
      >
        <Link href="/" className="shrink-0" aria-label="Overforge home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/auth"
            className="hidden rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.98] sm:inline-flex"
          >
            Sign in
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.fast, ease: EASE }}
            className="absolute top-16 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-border bg-card p-2 backdrop-blur-xl md:hidden"
          >
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/auth"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
            >
              Sign in
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
