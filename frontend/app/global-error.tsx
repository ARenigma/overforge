'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Catches errors thrown in the root layout or template — must supply its own
// <html>/<body> because the root layout is unavailable. Keep styles inline so
// the render works even if the CSS chunk fails to load.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Sentry's documented App Router render-error seam: dynamic import avoids
    // loading the SDK during SSR and keeps this chunk out of the critical path.
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '28rem',
            border: '1px solid #262626',
            background: '#111111',
            padding: '2rem',
          }}
        >
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'hsl(15 90% 53%)',
              margin: 0,
            }}
          >
            critical error
          </p>
          <h1
            style={{
              marginTop: '0.75rem',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#fafafa',
            }}
          >
            Application error
          </h1>
          <p
            style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa', lineHeight: 1.6 }}
          >
            A critical error occurred. Please refresh the page or contact support if the problem
            continues.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#52525b',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              height: '2.25rem',
              padding: '0 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#fafafa',
              background: 'transparent',
              border: '1px solid #262626',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
