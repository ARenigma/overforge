import Link from 'next/link';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';

export default function NotFound() {
  return (
    <main className="relative">
      <SiteNav />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">404</span> — not found
        </p>
        <h1 className="mt-5 max-w-xl text-balance text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-5xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-md text-pretty text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Go home
        </Link>
      </section>
      <Footer />
    </main>
  );
}
