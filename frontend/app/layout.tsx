import type React from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import SmoothScrollProvider from '@/components/smooth-scroll-provider';

export const metadata: Metadata = {
  title: 'Overforge — Live technical interviews',
  description: 'AI-led oral and coding interviews in a sandboxed IDE, with deterministic scoring.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          storageKey="overforge-theme"
        >
          <SmoothScrollProvider>{children}</SmoothScrollProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
