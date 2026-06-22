import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '../_components/sign-out-button';
import { RescoreButton } from '../_components/rescore-button';
import { PageContainer } from '@/components/ds/page-container';
import { StatusBadge, type BadgeIntent } from '@/components/ds/status-badge';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { statusMeta } from '@/lib/interview-status';
import { type Scorecard } from '@/lib/api';

interface Turn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
}
interface RunResult {
  language?: string;
  status: string;
  timeMs: number | null;
}
interface InterviewDetail {
  id: string;
  candidate_email: string | null;
  candidate_name: string | null;
  status: string;
  created_at: string;
  transcript: Turn[];
  code_snapshot: string;
  code_runs: RunResult[];
  evaluation_score: Scorecard | null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function recommendationIntent(sc: Scorecard): BadgeIntent {
  if (sc.scoringFailed) return 'warning';
  if (sc.recommendation === 'no_hire') return 'danger';
  if (sc.recommendation === 'strong_hire') return 'success';
  return 'info';
}

const RECOMMENDATION_LABEL: Record<Scorecard['recommendation'], string> = {
  strong_hire: 'Strong hire',
  hire: 'Hire',
  lean_hire: 'Lean hire',
  no_hire: 'No hire',
};

export default async function InterviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // RLS scopes this read to the signed-in interviewer's own rows; anything else 404s.
  const { data, error } = await supabase
    .from('interviews')
    .select(
      'id, candidate_email, candidate_name, status, created_at, transcript, code_snapshot, code_runs, evaluation_score'
    )
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();
  const iv = data as InterviewDetail;
  const meta = statusMeta(iv.status);
  const sc = iv.evaluation_score;
  const transcript = (iv.transcript ?? []).filter((t) => t.role !== 'system');
  const canRescore = transcript.length > 0;

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

          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {iv.candidate_name ?? iv.candidate_email ?? 'Candidate'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {iv.candidate_name && iv.candidate_email ? `${iv.candidate_email} · ` : ''}
                Created {formatDateTime(iv.created_at)}
              </p>
            </div>
            <StatusBadge intent={meta.intent} className="mt-1">
              {meta.label}
            </StatusBadge>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Transcript */}
            <section className="space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Transcript
              </h2>
              {transcript.length ? (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  {transcript.map((t, i) => (
                    <div
                      key={i}
                      className={`flex ${t.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={[
                          'max-w-[88%] px-3 py-2 text-sm leading-relaxed',
                          t.role === 'candidate'
                            ? 'whitespace-pre-wrap border border-primary/30 bg-primary/10 text-foreground'
                            : 'bg-muted text-foreground',
                        ].join(' ')}
                      >
                        {t.role === 'candidate' ? t.text : <MarkdownMessage text={t.text} />}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No conversation yet.
                </p>
              )}
            </section>

            {/* Code + scorecard */}
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Code
                </h2>
                {iv.code_snapshot ? (
                  <pre className="overflow-x-auto rounded-xl border border-border bg-[hsl(var(--surface-deep))] p-4 font-mono text-xs leading-relaxed text-foreground">
                    {iv.code_snapshot}
                  </pre>
                ) : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No code submitted.
                  </p>
                )}
                {iv.code_runs?.length ? (
                  <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                    {iv.code_runs.map((r, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span
                          className={r.status === 'Accepted' ? 'text-success' : 'text-destructive'}
                        >
                          {r.status}
                        </span>
                        <span>·</span>
                        <span>{r.language ?? 'unknown'}</span>
                        {r.timeMs != null ? (
                          <>
                            <span>·</span>
                            <span>{r.timeMs}ms</span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Scorecard
                  </h2>
                  {canRescore ? <RescoreButton interviewId={iv.id} hasScore={!!sc} /> : null}
                </div>
                {sc ? (
                  <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      {sc.scoringFailed ? (
                        <span className="text-sm text-muted-foreground">
                          Automatic scoring failed — manual review required.
                        </span>
                      ) : (
                        <span className="text-2xl font-semibold tabular-nums text-foreground">
                          {sc.overall}
                          <span className="text-base font-normal text-muted-foreground">/5</span>
                        </span>
                      )}
                      <StatusBadge intent={recommendationIntent(sc)} className="shrink-0">
                        {sc.scoringFailed
                          ? 'Manual review'
                          : RECOMMENDATION_LABEL[sc.recommendation]}
                      </StatusBadge>
                    </div>
                    {sc.dimensions?.length ? (
                      <ul className="space-y-2">
                        {sc.dimensions.map((d, i) => (
                          <li key={i} className="space-y-0.5 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-foreground">{d.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {d.score}/5
                              </span>
                            </div>
                            {d.notes ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {d.notes}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {sc.summary ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">{sc.summary}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Not scored yet.
                  </p>
                )}
              </section>
            </div>
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
