import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './_components/sign-out-button';
import { NewInterviewDialog } from './_components/new-interview-dialog';
import { InterviewTable, type InterviewRow } from './_components/interview-table';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { CalendarClock, CheckCircle2, Gauge, Users } from 'lucide-react';
import { PageHeader } from '@/components/ds/page-header';
import { MetricCard } from '@/components/ds/metric-card';
import { PageContainer } from '@/components/ds/page-container';
import { CommandMenuTrigger } from '@/components/ds/command-menu-trigger';

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  const { data: interviews, error } = await supabase
    .from('interviews')
    .select('id, candidate_email, candidate_name, status, created_at, evaluation_score')
    .order('created_at', { ascending: false });

  const rows = (interviews ?? []) as InterviewRow[];

  // "Scored" counts only genuinely-scored interviews — a failed-scoring fallback is not a score.
  const scoredRows = rows.filter((r) => r.evaluation_score && !r.evaluation_score.scoringFailed);
  const awaiting = rows.filter((r) => r.status === 'invited' || r.status === 'in_progress').length;
  const avgScore = scoredRows.length
    ? scoredRows.reduce((sum, r) => sum + (r.evaluation_score?.overall ?? 0), 0) / scoredRows.length
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 h-14 flex items-center justify-between gap-4">
          {/* Left: wordmark + breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <Wordmark />

            {/* Breadcrumb separator + page */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground select-none">
              <span className="opacity-40">/</span>
              <span className="text-foreground font-medium">Interviews</span>
            </div>
          </div>

          {/* Right: command menu + theme toggle + sign-out */}
          <div className="flex shrink-0 items-center gap-2">
            <CommandMenuTrigger className="hidden sm:inline-flex" />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main>
        <PageContainer>
          {/* ── Page header ─────────────────────────────────────────────── */}
          <PageHeader
            title="Interviews"
            description="All sessions where you are the interviewer"
            actions={<NewInterviewDialog />}
          />

          {/* ── Metrics (always the unfiltered totals) ──────────────────── */}
          {rows.length > 0 && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Total"
                value={rows.length}
                hint="All sessions"
                icon={<Users className="h-4 w-4" />}
              />
              <MetricCard
                label="Scored"
                value={scoredRows.length}
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
              <MetricCard
                label="Awaiting"
                value={awaiting}
                icon={<CalendarClock className="h-4 w-4" />}
              />
              <MetricCard
                label="Avg score"
                value={avgScore !== null ? avgScore.toFixed(1) : '—'}
                hint="out of 5"
                icon={<Gauge className="h-4 w-4" />}
              />
            </div>
          )}

          {/* ── Interview list (filter + table) ─────────────────────────── */}
          <InterviewTable rows={rows} error={error ?? null} />
        </PageContainer>
      </main>
    </div>
  );
}
