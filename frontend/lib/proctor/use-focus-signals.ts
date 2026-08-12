'use client';

import { useCallback, useEffect, useRef } from 'react';
import { sendIntegritySignal } from '@/lib/api';
import type { InterviewPhase } from '@/lib/api';

// Phases where focus-signal monitoring is active.
// Consent and done stages are excluded — only the live interview window is watched.
const ACTIVE_PHASES = new Set<InterviewPhase>([
  'greeting',
  'oral',
  'handoff',
  'coding',
  'wrap_up',
]);

// Minimum away duration before a signal is posted and a deterrence banner is shown.
const MIN_AWAY_MS = 1500;

// How many deterrence banners to show per session (prevents banner fatigue).
const MAX_BANNERS = 3;

interface UseFocusSignalsOptions {
  interviewId: string;
  token: string | null;
  phase: InterviewPhase;
  /** True only while stage === 'interview' — listeners are registered only then. */
  active: boolean;
  /** Called with deterrence text when a significant away event is detected (≥ MIN_AWAY_MS).
   *  Caller decides whether to surface the banner; this hook enforces MAX_BANNERS. */
  onAway: (text: string) => void;
}

/**
 * Tracks window blur/focus and document visibilitychange during the live interview.
 * When the candidate is away ≥ 1500 ms:
 *   - POSTs an integrity signal (fire-and-forget, swallows all errors).
 *   - Calls onAway with a deterrence message (at most MAX_BANNERS times per session).
 *
 * Active only during phases greeting..wrap_up. Cleans up all listeners on unmount or
 * when `active` transitions to false. The blurAt timestamp and banner count are
 * per-mount — they reset if the hook is destroyed and recreated (which doesn't happen
 * within a single interview session).
 */
export function useFocusSignals({
  interviewId,
  token,
  phase,
  active,
  onAway,
}: UseFocusSignalsOptions): void {
  // Live refs so listeners can read the latest values without re-registration.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const onAwayRef = useRef(onAway);
  useEffect(() => {
    onAwayRef.current = onAway;
  }, [onAway]);

  // Timestamp when the window lost focus / tab became hidden; null = window is focused.
  const awayAtRef = useRef<number | null>(null);
  // Count of deterrence banners shown this session.
  const bannerCountRef = useRef(0);

  const handleReturn = useCallback(
    (kind: 'blur' | 'hidden') => {
      const awayAt = awayAtRef.current;
      awayAtRef.current = null;
      if (awayAt === null) return;
      const durationMs = Date.now() - awayAt;
      if (durationMs < MIN_AWAY_MS) return;
      if (!ACTIVE_PHASES.has(phaseRef.current)) return;

      const tok = tokenRef.current;
      if (tok) sendIntegritySignal(interviewId, tok, { kind, durationMs });

      if (bannerCountRef.current < MAX_BANNERS) {
        bannerCountRef.current += 1;
        const secs = Math.round(durationMs / 1000);
        onAwayRef.current(
          `You were away from the interview window for ${secs}s — this is recorded.`
        );
      }
    },
    [interviewId]
  );

  useEffect(() => {
    if (!active) return;

    const onBlur = () => {
      if (!ACTIVE_PHASES.has(phaseRef.current)) return;
      if (awayAtRef.current === null) awayAtRef.current = Date.now();
    };

    const onFocus = () => handleReturn('blur');

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!ACTIVE_PHASES.has(phaseRef.current)) return;
        if (awayAtRef.current === null) awayAtRef.current = Date.now();
      } else {
        handleReturn('hidden');
      }
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, handleReturn]);
}
