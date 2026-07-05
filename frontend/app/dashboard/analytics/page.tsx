import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '../_components/sign-out-button';
import { PageContainer } from '@/components/ds/page-container';
import { PageHeader } from '@/components/ds/page-header';
import { CostAnalytics, type CostAnalyticsData } from './_components/cost-analytics';

// Admin-only cross-interview cost analytics. The admin_cost_analytics() RPC is is_admin()-gated
// (SECURITY DEFINER) and returns null for non-admins, so the gate is enforced in the DB — this page
// just reflects it. Admins are set directly in Supabase (public.admins).
export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data } = await supabase.rpc('admin_cost_analytics');
  const analytics = (data as CostAnalyticsData | null) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Link
            href="/"
            aria-label="Overforge — home"
            className="transition-opacity hover:opacity-80"
          >
            <Wordmark />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main>
        <PageContainer>
          <Link
            href="/dashboard"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Interviews
          </Link>

          <PageHeader
            title="Cost & usage"
            description="Spend, usage, and provider cost comparison across all interviews"
          />

          {analytics ? (
            <CostAnalytics data={analytics} />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              This dashboard is admin-only. Ask an admin to add your account in Supabase (
              <code className="font-mono text-xs">public.admins</code>).
            </div>
          )}
        </PageContainer>
      </main>
    </div>
  );
}
