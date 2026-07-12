import type React from 'react';
import type { Metadata } from 'next';
import { ViewTransitions } from 'next-view-transitions';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandMenuProvider } from '@/components/providers/command-menu-provider';
import { SentryInit } from '@/components/sentry-init';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : 'http://localhost:3000')
  ),
  title: 'Finite — Infinite candidates. Finite answers.',
  description:
    'An autonomous technical interviewer built as a finite-state machine. Deterministic control flow, sandboxed execution, auditable scoring.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${GeistSans.variable} ${GeistMono.variable}`}
      >
        <head>
          {/* Central font config — main (Satoshi) + mono (Source Code Pro). Swap families here
            and in globals.css (--font-sans / --font-mono) to test new fonts site-wide. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="font-sans antialiased">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
            storageKey="overforge-theme"
          >
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
            <Toaster />
            <SonnerToaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  borderRadius: '0',
                },
                classNames: {
                  success: 'sonner-success',
                  error: 'sonner-error',
                },
              }}
            />
            <CommandMenuProvider />
            <SentryInit />
          </ThemeProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}
