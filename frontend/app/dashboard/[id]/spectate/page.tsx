'use client';

/**
 * Spectate page — the owning interviewer watches a live interview read-only.
 *
 * Auth: Supabase Bearer JWT (requireInterviewer on the backend). The candidate-token
 * auth boundary on /speak and /speak-stream is NOT crossed — see audio note below.
 *
 * Audio: /speak and /speak-stream use validateCandidate (candidate access-token). An
 * interviewer's Supabase JWT has no access to those routes without a valid candidate token.
 * Bridging the gap would require either leaking the candidate token to the interviewer or
 * adding a separate spectator-authed TTS route. Neither is done here to preserve the
 * candidate-token security boundary. The transcript streams live instead; audio is deferred.
 * Clean path when needed: add GET /api/interviews/:id/spectate-speak (requireInterviewer +
 * assertOwner) that proxies the same Cartesia call as /speak-stream but authenticated via
 * the interviewer's JWT.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getSpectateView, type SpectateView, type TranscriptTurn } from '@/lib/api';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { ProblemDock } from '@/components/interview/problem-dock';
import { StatusBadge } from '@/components/ds/status-badge';
import { Button } from '@/components/ui/button';

const EnhancedCodeMirrorEditor = dynamic(
  () =>
    import('@/components/enhanced-code-mirror-editor').then((m) => m.EnhancedCodeMirrorEditor),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted" /> }
);

const POLL_INTERVAL_MS = 3_000;
const PROBLEM_SOFT_BUDGET_S = 15 * 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function phaseLabel(phase: string): string {
  const LABELS: Record<string, string> = {
    greeting: 'Greeting',
    oral: 'Oral questions',
    handoff: 'Handoff',
    coding: 'Coding',
    wrap_up: 'Wrap-up',
    done: 'Done',
  };
  return LABELS[phase] ?? phase;
}

// ── Transcript bubble ─────────────────────────────────────────────────────────

function TranscriptBubble({ turn }: { turn: TranscriptTurn }) {
  if (turn.role === 'system') return null;
  const isCandidate = turn.role === 'candidate';
  const hasAssist = !isCandidate && turn.assist;

  return (
    <div className={`flex ${isCandidate ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[88%] px-3 py-2 text-sm leading-relaxed',
          isCandidate
            ? 'whitespace-pre-wrap border border-primary/30 bg-primary/10 text-foreground'
            : hasAssist
              ? 'border border-amber-500/30 bg-amber-500/10 text-foreground'
              : 'bg-muted text-foreground',
        ].join(' ')}
      >
        {isCandidate ? turn.text : <MarkdownMessage text={turn.text} />}
        {hasAssist && (
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {turn.assist!.kind.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SpectatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [view, setView] = useState<SpectateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Live elapsed counter — incremented by a 1s ticker so the displayed time stays current
  // between polls without hammering the server.
  const [liveElapsed, setLiveElapsed] = useState<number | null>(null);

  const accessTokenRef = useRef<string | null>(null);
  const visibleRef = useRef(true);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  // Resolve the Supabase access token once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled && session?.access_token) {
        accessTokenRef.current = session.access_token;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the spectate endpoint.
  const poll = useCallback(async () => {
    if (!visibleRef.current) return;
    const token = accessTokenRef.current;
    if (!token || !id) return;
    try {
      const data = await getSpectateView(token, id);
      setView(data);
      setLiveElapsed(data.elapsedSeconds);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load spectate view';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial fetch + polling interval.
  useEffect(() => {
    // Wait briefly for the token to resolve before the first poll.
    const initial = setTimeout(() => void poll(), 300);
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [poll]);

  // Pause polling when the tab is hidden; resume (and re-poll immediately) when visible again.
  useEffect(() => {
    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [poll]);

  // 1-second live elapsed counter so the displayed time ticks without waiting for a poll.
  useEffect(() => {
    if (liveElapsed === null) return;
    const timer = setInterval(() => {
      setLiveElapsed((prev) => (prev !== null ? prev + 1 : prev));
    }, 1_000);
    return () => clearInterval(timer);
  }, [liveElapsed !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll transcript to bottom on new turns.
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [view?.transcript?.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const visibleTranscript = (view?.transcript ?? []).filter((t) => t.role !== 'system');
  const elapsedDisplay = liveElapsed !== null ? formatElapsed(liveElapsed) : '--:--';
  const remainingDisplay =
    view && liveElapsed !== null
      ? formatElapsed(Math.max(0, view.durationSeconds - liveElapsed))
      : '--:--';
  const overBudget =
    view?.phase === 'coding' && liveElapsed !== null && liveElapsed > PROBLEM_SOFT_BUDGET_S;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* SPECTATING badge */}
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
            <Radio className="h-2.5 w-2.5 animate-pulse" aria-hidden="true" />
            Spectating
          </span>
          {view && (
            <>
              <span className="font-mono text-xs text-muted-foreground">
                {phaseLabel(view.phase)}
              </span>
              <span className="font-mono text-xs text-muted-foreground" aria-label="Elapsed time">
                {elapsedDisplay}
                {' / '}
                <span className="text-muted-foreground/60">{remainingDisplay} left</span>
              </span>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Exit spectate view"
          onClick={() => router.push(`/dashboard/${id}`)}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Exit
        </Button>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/dashboard/${id}`)}
              className="gap-1.5 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to interview
            </Button>
          </div>
        </div>
      )}

      {view && !loading && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── Left: Transcript ─────────────────────────────────────────── */}
          <section
            className="flex w-[360px] shrink-0 flex-col border-r border-border"
            aria-label="Live transcript"
          >
            <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Transcript
              </span>
              <StatusBadge intent="info" className="ml-auto text-[9px]">
                {phaseLabel(view.phase)}
              </StatusBadge>
            </div>

            <div
              aria-live="polite"
              aria-label="Interview transcript, live updates"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
            >
              {visibleTranscript.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                  No conversation yet.
                </p>
              ) : (
                visibleTranscript.map((turn, i) => (
                  <TranscriptBubble key={i} turn={turn} />
                ))
              )}
              <div ref={transcriptBottomRef} />
            </div>

            {/* Audio note — TTS deferred: see module-level comment for exact reason + clean path */}
            <div className="border-t border-border px-3 py-2">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Audio playback for spectators is not yet wired. The candidate-token security
                boundary prevents /speak-stream from accepting the interviewer&apos;s JWT.
                Add a dedicated spectator-authed TTS route to enable it.
              </p>
            </div>
          </section>

          {/* ── Right: Problem + Code ────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Problem panel — shown only during coding phase when a problem exists */}
            {view.phase === 'coding' && view.problem && (
              <div className="h-[280px] shrink-0 border-b border-border">
                <ProblemDock
                  problem={view.problem}
                  index={view.codeIndex}
                  total={view.total}
                  clock={elapsedDisplay}
                  overBudget={overBudget}
                  onCollapseAction={() => {
                    /* spectate: collapse is a no-op */
                  }}
                />
              </div>
            )}

            {/* Code snapshot — read-only */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Code snapshot
                </span>
                {view.language && (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                    {view.language}
                  </span>
                )}
                {view.lastRunStatus && (
                  <span
                    className={`ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[9px] ${
                      view.lastRunStatus === 'Accepted'
                        ? 'bg-success/10 text-success'
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    Last run: {view.lastRunStatus}
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-hidden" aria-label="Candidate code, read-only">
                {view.codeSnapshot ? (
                  <EnhancedCodeMirrorEditor
                    value={view.codeSnapshot}
                    onCodeChangeAction={() => {
                      /* read-only: changes ignored */
                    }}
                    language={view.language ?? 'python'}
                    readOnly
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">No code yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
