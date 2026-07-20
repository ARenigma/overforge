import { Loader2 } from 'lucide-react';
import { Wordmark } from '@/components/marketing/wordmark';
import { PageContainer } from '@/components/ds/page-container';

/** Route-level fallback shown while the analytics page loads. */
export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Wordmark />
        </div>
      </header>

      <main>
        <PageContainer>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
