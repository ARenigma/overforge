import { Wordmark } from '@/components/marketing/wordmark';

/** Route-level skeleton shown while the dashboard's interview list loads. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Wordmark />
          <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-10 sm:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-11 border-b border-border bg-muted/50" />
          <ul>
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0"
              >
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="hidden h-4 w-24 animate-pulse rounded bg-muted/60 sm:block" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted/60" />
                <div className="h-5 w-12 animate-pulse rounded bg-muted/60" />
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
