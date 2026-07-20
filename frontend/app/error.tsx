'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Surface to Sentry without blocking render.
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border border-border bg-card p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">error</p>
        <h1 className="mt-3 text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred. You can try again or return home if it persists.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground/60">ref: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="h-9 border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
          >
            Try again
          </button>
          <a
            href="/"
            className="h-9 border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card inline-flex items-center"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
