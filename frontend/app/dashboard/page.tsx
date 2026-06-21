import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './_components/sign-out-button';
import { NewInterviewDialog } from './_components/new-interview-dialog';
import { ScorecardDialog } from './_components/scorecard-dialog';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { CalendarClock } from 'lucide-react';
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

  const { data: interviews } = await supabase
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
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 flex flex-col items-center gap-3 text-center">
            <CalendarClock className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No interviews yet</p>
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              Create your first session and share the link with a candidate.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_160px_120px_auto] gap-4 px-5 py-3 bg-muted/50 border-b border-border">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Candidate
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Created
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Status
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Score
              </span>
            </div>

            {/* Rows */}
            <ul>
              {rows.map((interview, idx) => (
                <li
                  key={interview.id}
                  className={[
                    'grid grid-cols-[1fr_160px_120px_auto] gap-4 px-5 py-3.5 items-center',
                    'transition-colors hover:bg-accent/50',
                    idx < rows.length - 1 ? 'border-b border-border' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Candidate */}
                  <span className="text-sm text-foreground truncate">
                    {interview.candidate_email ?? (
                      <span className="text-muted-foreground italic">No candidate yet</span>
                    )}
                  </span>

                  {/* Date */}
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatDate(interview.created_at)}
                  </span>

                  {/* Status pill */}
                  <Badge
                    variant="outline"
                    className={`text-xs w-fit capitalize ${statusVariant(interview.status)}`}
                  >
                    {interview.status}
                  </Badge>

                  {/* Score / scorecard trigger */}
                  <div className="flex items-center gap-2">
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
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
