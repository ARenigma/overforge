import Link from 'next/link';
import { Wordmark } from './wordmark';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Features', href: '#product' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Sign in', href: '/auth' },
      { label: 'Start free', href: '/auth' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-14 sm:grid-cols-4">
        <div className="col-span-2">
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Live technical interviews, run by an AI that listens.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-medium text-foreground">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-5xl px-6 py-5 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Overforge
        </p>
      </div>
    </footer>
  );
}
