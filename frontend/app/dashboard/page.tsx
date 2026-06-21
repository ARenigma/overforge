import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './_components/sign-out-button';
import { NewInterviewDialog } from './_components/new-interview-dialog';
import { ScorecardDialog } from './_components/scorecard-dialog';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { AlertCircle, CalendarClock } from 'lucide-react';
import { type Scorecard } from '@/lib/api';

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
        {/* ── Page section header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Interviews</h1>
            <p className="text-sm text-muted-foreground">
              All sessions where you are the interviewer
            </p>
          </div>

          <NewInterviewDialog />
        </div>

        {/* ── Interview list ──────────────────────────────────────────── */}
        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-6 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load your interviews
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Something went wrong fetching your sessions. Refresh the page to try again.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
            <CalendarClock className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No interviews yet</p>
            <p className="max-w-xs text-xs text-muted-foreground/60">
              Create your first session and share the link with a candidate.
            </p>
          </div>
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
