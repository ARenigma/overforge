import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './_components/sign-out-button';
import { NewInterviewDialog } from './_components/new-interview-dialog';
import { ScorecardDialog } from './_components/scorecard-dialog';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { CalendarClock, CheckCircle2, Gauge, Users } from 'lucide-react';
import { type Scorecard } from '@/lib/api';
import { PageHeader } from '@/components/ds/page-header';
import { MetricCard } from '@/components/ds/metric-card';
import { EmptyState, ErrorState } from '@/components/ds/state-block';

interface Interview {
  id: string;
  candidate_email: string | null;
  status: string;
  created_at: string;
  evaluation_score: Scorecard | null;
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, string> = {
  pending: 'border-border text-muted-foreground bg-transparent',
  active: 'border-primary/40 text-primary bg-primary/10',
  completed: 'border-success/40 text-success bg-success/10',
  scored: 'border-success/40 text-success bg-success/10',
  cancelled: 'border-destructive/40 text-destructive bg-destructive/10',
};

function statusVariant(status: string) {
  return (
    STATUS_VARIANT[status.toLowerCase()] ?? 'border-border text-muted-foreground bg-transparent'
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? 'border-success/40 text-success bg-success/10'
      : score >= 3
        ? 'border-primary/40 text-primary bg-primary/10'
        : 'border-destructive/40 text-destructive bg-destructive/10';

  return (
    <Badge variant="outline" className={`font-mono text-[11px] ${color}`}>
      {score}/5
    </Badge>
  );
}

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
    .select('id, candidate_email, status, created_at, evaluation_score')
    .order('created_at', { ascending: false });

  const rows = (interviews ?? []) as Interview[];

  const scoredRows = rows.filter((r) => r.evaluation_score);
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

          {/* Right: theme toggle + sign-out */}
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="max-w-[1200px] mx-auto px-6 sm:px-8 py-10">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <PageHeader
          title="Interviews"
          description="All sessions where you are the interviewer"
          actions={<NewInterviewDialog />}
        />

        {/* ── Metrics ─────────────────────────────────────────────────── */}
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
              value={rows.length - scoredRows.length}
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

        {/* ── Interview list ──────────────────────────────────────────── */}
        {error ? (
          <ErrorState
            title="Couldn't load your interviews"
            description="Something went wrong fetching your sessions. Refresh the page to try again."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title="No interviews yet"
            description="Create your first session and share the link with a candidate."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    Candidate
                  </th>
                  <th
                    scope="col"
                    className="hidden px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground sm:table-cell"
                  >
                    Created
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((interview) => (
                  <tr
                    key={interview.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-accent/50"
                  >
                    {/* Candidate (+ date on mobile, where the Created column is hidden) */}
                    <td className="px-5 py-3.5 align-middle">
                      <span className="block truncate text-sm text-foreground">
                        {interview.candidate_email ?? (
                          <span className="italic text-muted-foreground">No candidate yet</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground sm:hidden">
                        {formatDate(interview.created_at)}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="hidden px-5 py-3.5 align-middle text-sm tabular-nums text-muted-foreground sm:table-cell">
                      {formatDate(interview.created_at)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 align-middle">
                      <Badge
                        variant="outline"
                        className={`w-fit text-xs capitalize ${statusVariant(interview.status)}`}
                      >
                        {interview.status}
                      </Badge>
                    </td>

                    {/* Score / scorecard trigger */}
                    <td className="px-5 py-3.5 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {interview.evaluation_score ? (
                          <>
                            <ScoreBadge score={interview.evaluation_score.overall} />
                            <ScorecardDialog
                              interviewId={interview.id}
                              scorecard={interview.evaluation_score}
                            />
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
