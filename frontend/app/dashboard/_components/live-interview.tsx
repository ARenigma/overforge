'use client';

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { RescoreButton } from './rescore-button';
import { StatusBadge, type BadgeIntent } from '@/components/ds/status-badge';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { statusMeta } from '@/lib/interview-status';
import { type Scorecard } from '@/lib/api';
import { INTERVIEW_DETAIL_COLUMNS, type InterviewDetail } from '@/lib/interview-detail';

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

/**
 * Live spectator view for the interviewer. The server component does the initial
 * RLS-scoped fetch and hands the row in as `initial`; this client component then owns
 * the live data so updates render the instant they happen — no RSC refetch involved:
 *
 *  - Supabase Realtime UPDATE on the interview row triggers a re-fetch (instant). The
 *    socket is authenticated with the user's JWT so the owner-RLS policy delivers events.
 *  - A 4s poll re-fetches the row directly via the authed browser client as a fallback,
 *    so the view stays live even if Realtime is unavailable.
 *
 * Both mechanisms re-select the exact columns the page renders, keeping a single source
 * of truth. They run only while the interview can still change (in progress / scoring).
 */
export function LiveInterview({ initial }: { initial: InterviewDetail }) {
  const [iv, setIv] = useState<InterviewDetail>(initial);
  const [connected, setConnected] = useState(false);

  const live = iv.status === 'in_progress' || iv.status === 'completed';

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    async function refetch() {
      const { data } = await supabase
        .from('interviews')
        .select(INTERVIEW_DETAIL_COLUMNS)
        .eq('id', initial.id)
        .single();
      if (data && !cancelled) setIv(data as unknown as InterviewDetail);
    }

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      // Authenticate the Realtime socket so RLS (auth.uid() = interviewer_id) delivers events.
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`interview-${initial.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'interviews', filter: `id=eq.${initial.id}` },
          () => void refetch()
        )
        .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    })();

    // Polling fallback — guarantees liveness even if the Realtime socket is blocked.
    const poll = setInterval(() => void refetch(), 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [live, initial.id]);

  const meta = statusMeta(iv.status);
  const sc = iv.evaluation_score;
  const transcript = (iv.transcript ?? []).filter((t) => t.role !== 'system');
  const canRescore = transcript.length > 0;

  return (
    <>
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
        <div className="mt-1 flex items-center gap-3">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-primary' : 'bg-primary/60'}`}
              />
              Live
            </span>
          ) : null}
          <StatusBadge intent={meta.intent}>{meta.label}</StatusBadge>
        </div>
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
                    <span className={r.status === 'Accepted' ? 'text-success' : 'text-destructive'}>
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
                    {sc.scoringFailed ? 'Manual review' : RECOMMENDATION_LABEL[sc.recommendation]}
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
                          <p className="text-xs leading-relaxed text-muted-foreground">{d.notes}</p>
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
    </>
  );
}
