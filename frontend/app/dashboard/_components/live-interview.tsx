'use client';

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { RescoreButton } from './rescore-button';
import { InviteLinkPanel } from './invite-link-panel';
import { StatusBadge, type BadgeIntent } from '@/components/ds/status-badge';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { statusMeta } from '@/lib/interview-status';
import { type Scorecard, regenerateInviteLink } from '@/lib/api';
import {
  INTERVIEW_DETAIL_COLUMNS,
  type InterviewDetail,
  type CostSummary,
} from '@/lib/interview-detail';
import { Button } from '@/components/ui/button';
import { Link } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function recommendationIntent(sc: Scorecard): BadgeIntent {
  if (sc.incomplete || sc.scoringFailed) return 'warning';
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Admin-only cost. Fetched from the RLS-gated interview_cost table: a non-admin's read returns
  // nothing (policy denies), so the cost panel never renders — and the dollars are never even in
  // the payload. Admins (set directly in Supabase) get the row.
  const [adminCost, setAdminCost] = useState<CostSummary | null>(null);

  const live = iv.status === 'in_progress' || iv.status === 'completed';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from('interview_cost')
        .select('cost_summary')
        .eq('interview_id', initial.id)
        .maybeSingle();
      if (!cancelled) setAdminCost((data?.cost_summary as CostSummary | undefined) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id, iv.status]);

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

  async function openInviteDialog() {
    setInviteLink(null);
    setInviteError(null);
    setInviteOpen(true);
    setInviteLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token)
        throw new Error('Your session has expired. Please sign in again.');
      const result = await regenerateInviteLink(session.access_token, iv.id);
      setInviteLink(result.link);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Failed to generate invite link.');
    } finally {
      setInviteLoading(false);
    }
  }

  const meta = statusMeta(iv.status);
  const sc = iv.evaluation_score;
  const transcript = (iv.transcript ?? []).filter((t) => t.role !== 'system');
  // Re-score only a finished (scored) or stuck-mid-score (completed) interview — matches the
  // backend allowlist. Never a live in_progress (would end the candidate's session) or an
  // incomplete result (would misrepresent a partial as a real verdict).
  const canRescore =
    (iv.status === 'scored' || iv.status === 'completed') &&
    transcript.length > 0 &&
    !sc?.incomplete;

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
          {/* Regenerate + copy a fresh invite link — only before the interview has started. */}
          {iv.status === 'invited' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openInviteDialog()}
              className="h-8 gap-1.5 border-border text-xs text-muted-foreground hover:text-foreground"
            >
              <Link className="h-3.5 w-3.5" />
              Copy invite link
            </Button>
          )}
          <StatusBadge intent={meta.intent}>{meta.label}</StatusBadge>
        </div>
      </div>

      {/* Fresh invite link dialog (invited interviews only). */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-card border border-border text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Invite link</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-4 pt-1">
            {inviteLoading && (
              <p className="text-sm text-muted-foreground">Generating fresh link…</p>
            )}
            {inviteError && (
              <Alert className="border-destructive/40 bg-destructive/10 py-2 px-3">
                <AlertDescription className="text-destructive text-sm">
                  {inviteError}
                </AlertDescription>
              </Alert>
            )}
            {inviteLink && (
              <>
                <InviteLinkPanel
                  link={inviteLink}
                  candidateEmail={iv.candidate_email ?? undefined}
                />
                <p className="text-xs text-muted-foreground">
                  This is a fresh link — any previously shared link will stop working.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
              <pre className="overflow-x-auto rounded-xl border border-border bg-surface-deep p-4 font-mono text-xs leading-relaxed text-foreground">
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
                  {sc.incomplete ? (
                    <span className="text-sm text-muted-foreground">
                      Interview incomplete — partial result, not a final verdict.
                    </span>
                  ) : sc.scoringFailed ? (
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
                    {sc.incomplete
                      ? 'Incomplete'
                      : sc.scoringFailed
                        ? 'Manual review'
                        : RECOMMENDATION_LABEL[sc.recommendation]}
                  </StatusBadge>
                </div>
                {sc.timeLimited && !sc.incomplete ? (
                  <p className="text-xs text-muted-foreground">
                    Concluded at the time limit — graded on the work completed.
                  </p>
                ) : null}
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

          {/* Cost & metrics — exact per-interview cost to you (raw usage is authoritative; $ is
              computed from configured rates). Only present once rolled up (at scoring). */}
          {adminCost ? (
            <section className="space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Cost &amp; metrics
              </h2>
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Cost to you</span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    ${adminCost.total_usd.toFixed(4)}
                  </span>
                </div>
                <ul className="space-y-1 border-t border-border pt-3 text-sm">
                  {Object.entries(adminCost.by_kind).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        ${v.toFixed(4)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  {iv.duration_seconds != null ? (
                    <div className="flex justify-between">
                      <dt>Duration</dt>
                      <dd className="font-mono tabular-nums text-foreground">
                        {Math.floor(iv.duration_seconds / 60)}m {iv.duration_seconds % 60}s
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt>Tokens</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {(adminCost.tokens.prompt + adminCost.tokens.completion).toLocaleString()}
                    </dd>
                  </div>
                  {adminCost.stt_seconds > 0 ? (
                    <div className="flex justify-between">
                      <dt>Speech</dt>
                      <dd className="font-mono tabular-nums text-foreground">
                        {Math.round(adminCost.stt_seconds)}s
                      </dd>
                    </div>
                  ) : null}
                  {adminCost.tts_chars > 0 ? (
                    <div className="flex justify-between">
                      <dt>TTS chars</dt>
                      <dd className="font-mono tabular-nums text-foreground">
                        {adminCost.tts_chars.toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {iv.metrics_summary?.problems?.length ? (
                  <ul className="space-y-1 border-t border-border pt-3 text-xs">
                    {iv.metrics_summary.problems.map((p, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="truncate text-muted-foreground">{p.slug}</span>
                        <span className="font-mono tabular-nums text-foreground">
                          {p.passed}/{p.total} tests
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
