import Link from 'next/link';
import { Wordmark } from '@/components/marketing/wordmark';

const LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Sign in', href: '/auth' },
] as const;

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 py-8 sm:flex-row sm:justify-between sm:gap-4">
        <Wordmark />
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Overforge</p>
      </div>
    </footer>
  );
}
