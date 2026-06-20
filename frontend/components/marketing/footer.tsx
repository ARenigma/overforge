import Link from 'next/link';
import { Wordmark } from '@/components/marketing/wordmark';

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-sm text-muted-foreground">
            Live technical interviews, run by an AI that listens.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"
        >
          <a href="#product" className="transition-colors hover:text-foreground">
            Product
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
          <Link href="/auth" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-5xl px-6 py-5 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Overforge
        </p>
      </div>
    </footer>
  );
}
