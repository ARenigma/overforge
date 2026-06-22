import { Wordmark } from '@/components/marketing/wordmark';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/components/ds/page-container';

/** Route-level skeleton shown while the dashboard's interview list loads. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Wordmark />
          <Skeleton className="h-8 w-20" />
        </div>
      </header>

      <main>
        <PageContainer>
          {/* Page header */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-36" />
          </div>

          {/* Metrics */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px]" />
            ))}
          </div>

          {/* Filter bar */}
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-40" />
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border">
            <Skeleton className="h-11 rounded-none" />
            <ul>
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="hidden h-4 w-24 sm:block" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </li>
              ))}
            </ul>
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
