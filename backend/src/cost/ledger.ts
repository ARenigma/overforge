// Cost + metrics ledger. All writes are BEST-EFFORT: a ledger failure must never break the FSM,
// a code run, TTS, or scoring. cost_events is the append-only raw source of truth; rollupInterview
// denormalizes per-interview totals onto the interviews row at conclusion.

import { createServiceClient } from '../db/supabase';
import { getById } from '../db/interviews';
import { currentCostContext } from './context';
import { llmCost, ttsCost, sttCost, execCost } from './pricing';
import { activeTtsProvider } from '../voice/tts';

interface CostEventRow {
  interview_id: string;
  kind: 'brain' | 'scorer' | 'stt' | 'tts' | 'exec';
  provider?: string;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  audio_seconds?: number | null;
  chars?: number | null;
  exec_ms?: number | null;
  cost_usd: number;
  phase?: string | null;
}

async function insertCostEvent(row: CostEventRow): Promise<void> {
  try {
    await createServiceClient().from('cost_events').insert(row);
  } catch (err) {
    console.error('[cost] insert failed (non-fatal):', err);
  }
}

/** Record one LLM call's token usage, attributed to the ambient cost context (set at the call site).
 *  No-op outside a context (unit tests / non-interview calls). Fire-and-forget. */
export function recordLlmUsage(args: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}): void {
  const ctx = currentCostContext();
  if (!ctx) return;
  void insertCostEvent({
    interview_id: ctx.interviewId,
    kind: ctx.kind,
    provider: args.provider,
    model: args.model,
    prompt_tokens: args.promptTokens,
    completion_tokens: args.completionTokens,
    total_tokens: args.totalTokens,
    cost_usd: llmCost(args.model, args.promptTokens, args.completionTokens),
    phase: ctx.phase ?? null,
  });
}

/** Record sandbox execution time for a /run (sum of the run + its hidden-test containers). */
export function recordExecCost(interviewId: string, execMs: number, phase = 'coding'): void {
  void insertCostEvent({
    interview_id: interviewId,
    kind: 'exec',
    provider: 'docker',
    exec_ms: Math.round(execMs),
    cost_usd: execCost(execMs),
    phase,
  });
}

/** Record TTS synthesis cost. Provider is read from TTS_PROVIDER at call time.
 *  Grok rate: GROK_TTS_USD_PER_MCHAR env (default $15/1M chars).
 *  Cartesia rate: TTS_USD_PER_MCHAR env (default ~$65/1M chars, see pricing.ts). */
export function recordTtsCost(interviewId: string, chars: number, phase?: string): void {
  const provider = activeTtsProvider();
  let costUsd: number;
  if (provider === 'grok') {
    const rawRate = Number(process.env.GROK_TTS_USD_PER_MCHAR ?? 15);
    const rate = Number.isFinite(rawRate) ? rawRate : 15;
    costUsd = (chars / 1_000_000) * rate;
  } else {
    costUsd = ttsCost(chars);
  }
  void insertCostEvent({
    interview_id: interviewId,
    kind: 'tts',
    provider,
    chars,
    cost_usd: costUsd,
    phase: phase ?? null,
  });
}

interface CostRow {
  kind: string;
  cost_usd: number | string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  chars: number | null;
  exec_ms: number | null;
}

/** Roll up cost_events + transcript + runs + voice telemetry into interviews.cost_summary /
 *  metrics_summary / duration_seconds. Call at the END of scoring. Best-effort (never throws). */
export async function rollupInterview(interviewId: string): Promise<void> {
  try {
    const db = createServiceClient();

    // STT is billed Python-side; its seconds already live in voice_turn_telemetry.audio_s. Fold
    // that into the ledger as a single STT cost_event so cost_events is complete.
    const { data: vt } = await db
      .from('voice_turn_telemetry')
      .select('audio_s, shadow_engine')
      .eq('interview_id', interviewId);
    const vtRows = (vt ?? []) as { audio_s: number | null; shadow_engine: string | null }[];
    const sttSeconds = vtRows.reduce((s, r) => s + (Number(r.audio_s) || 0), 0);
    if (sttSeconds > 0) {
      await insertCostEvent({
        interview_id: interviewId,
        kind: 'stt',
        provider: 'assemblyai',
        audio_seconds: sttSeconds,
        cost_usd: sttCost(sttSeconds, 'assemblyai'),
      });
    }
    // Shadow STT (e.g. Soniox) runs in PARALLEL on the same audio — a real cost during the A/B AND
    // the apples-to-apples cost comparison (same seconds, different rate) for the admin dashboard.
    const shadowSeconds: Record<string, number> = {};
    for (const r of vtRows) {
      if (r.shadow_engine)
        shadowSeconds[r.shadow_engine] =
          (shadowSeconds[r.shadow_engine] ?? 0) + (Number(r.audio_s) || 0);
    }
    for (const [engine, secs] of Object.entries(shadowSeconds)) {
      if (secs > 0) {
        await insertCostEvent({
          interview_id: interviewId,
          kind: 'stt',
          provider: engine,
          audio_seconds: secs,
          cost_usd: sttCost(secs, engine),
        });
      }
    }

    const { data: rows } = await db
      .from('cost_events')
      .select('kind,cost_usd,prompt_tokens,completion_tokens,total_tokens,chars,exec_ms')
      .eq('interview_id', interviewId);
    const events = (rows ?? []) as CostRow[];

    const byKind: Record<string, number> = {};
    let totalUsd = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let ttsChars = 0;
    let execMs = 0;
    for (const e of events) {
      const c = Number(e.cost_usd) || 0;
      totalUsd += c;
      byKind[e.kind] = (byKind[e.kind] ?? 0) + c;
      promptTokens += e.prompt_tokens ?? 0;
      completionTokens += e.completion_tokens ?? 0;
      ttsChars += e.chars ?? 0;
      execMs += e.exec_ms ?? 0;
    }
    const round = (n: number): number => Math.round(n * 1e6) / 1e6;
    const cost_summary = {
      total_usd: round(totalUsd),
      by_kind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, round(v)])),
      tokens: { prompt: promptTokens, completion: completionTokens },
      tts_chars: ttsChars,
      stt_seconds: round(sttSeconds),
      exec_ms: execMs,
    };

    // ── Metrics from the interview row (transcript / runs / assigned problems). ──
    const interview = await getById(interviewId);
    const transcript = interview?.transcript ?? [];
    const candidateTurns = transcript.filter((t) => t.role === 'candidate').length;
    const interventions: Record<string, number> = {};
    for (const t of transcript) {
      const kind = t.assist?.kind;
      if (t.role === 'interviewer' && kind) interventions[kind] = (interventions[kind] ?? 0) + 1;
    }
    const runs = interview?.code_runs ?? [];
    for (const r of runs) {
      const k = r.intervention?.kind;
      if (k) interventions[k] = (interventions[k] ?? 0) + 1;
    }
    // Per-problem best pass ratio.
    const problemIds = interview?.coding_problem_ids ?? [];
    const problems = problemIds.map((slug: string, idx: number) => {
      const forIdx = runs.filter((r) => r.codeIndex === idx && r.testResults);
      const best = forIdx.reduce(
        (m, r) => {
          const tr = r.testResults!;
          const ratio = tr.total > 0 ? tr.passed / tr.total : 0;
          return ratio > m.ratio ? { ratio, passed: tr.passed, total: tr.total } : m;
        },
        { ratio: 0, passed: 0, total: 0 }
      );
      return {
        slug,
        pass_ratio: round(best.ratio),
        passed: best.passed,
        total: best.total,
        runs: forIdx.length,
      };
    });

    const startedAt = interview?.tnc_accepted_at
      ? new Date(interview.tnc_accepted_at).getTime()
      : null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      : null;

    const metrics_summary = {
      duration_s: durationSeconds,
      candidate_turns: candidateTurns,
      interventions,
      problems,
    };

    // Cost ($) is ADMIN-ONLY → its own RLS-gated table, never on the interviewer-readable
    // interviews row. metrics_summary + duration_seconds are interview-quality data (not cost) and
    // stay on the interview.
    await db.from('interview_cost').upsert({
      interview_id: interviewId,
      cost_summary,
      total_usd: cost_summary.total_usd,
      updated_at: new Date().toISOString(),
    });
    await db
      .from('interviews')
      .update({
        metrics_summary,
        ...(durationSeconds != null ? { duration_seconds: durationSeconds } : {}),
      })
      .eq('id', interviewId);
  } catch (err) {
    console.error(`[cost] rollup failed for ${interviewId} (non-fatal):`, err);
  }
}
