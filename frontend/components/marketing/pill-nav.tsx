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
  const [hovered, setHovered] = React.useState<string | null>(null);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Primary"
        className="flex items-center gap-1 rounded-full border border-border/70 bg-card/70 py-1.5 pl-3 pr-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60"
      >
        <Link href="/" className="mr-1 shrink-0" aria-label="Overforge home">
          <Wordmark />
        </Link>

        {/* Desktop links with a snappy sliding highlight (Supabase-style) */}
        <div className="relative hidden items-center md:flex" onMouseLeave={() => setHovered(null)}>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onMouseEnter={() => setHovered(l.href)}
              className={cn(
                'relative rounded-full px-3 py-1.5 text-sm transition-colors duration-150',
                hovered === l.href ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {hovered === l.href && (
                <motion.span
                  layoutId="nav-highlight"
                  className="absolute inset-0 -z-10 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }}
                />
              )}
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1 pl-1">
          <ThemeToggle />
          <Link
            href="/auth"
            className="hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] sm:inline-flex"
          >
            Sign in
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE }}
            className="absolute top-16 w-[calc(100%-2rem)] max-w-sm origin-top rounded-2xl border border-border bg-card p-2 backdrop-blur-xl md:hidden"
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
