import { type Scorecard } from '@/lib/api';

export interface Turn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
}

export interface RunResult {
  language?: string;
  status: string;
  timeMs: number | null;
}

/** Per-interview cost rollup (interviews.cost_summary). Raw usage is authoritative; usd is derived. */
export interface CostSummary {
  total_usd: number;
  by_kind: Record<string, number>;
  tokens: { prompt: number; completion: number };
  tts_chars: number;
  stt_seconds: number;
  exec_ms: number;
}

export interface MetricsSummary {
  duration_s: number | null;
  candidate_turns: number;
  interventions: Record<string, number>;
  problems: { slug: string; pass_ratio: number; passed: number; total: number; runs: number }[];
}

export interface InterviewDetail {
  id: string;
  candidate_email: string | null;
  candidate_name: string | null;
  status: string;
  created_at: string;
  transcript: Turn[];
  code_snapshot: string;
  code_runs: RunResult[];
  evaluation_score: Scorecard | null;
  // NOTE: cost ($) is ADMIN-ONLY and lives in the RLS-gated `interview_cost` table — it is
  // deliberately NOT selected here so a regular interviewer's payload never contains it.
  metrics_summary: MetricsSummary | null;
  duration_seconds: number | null;
}

/**
 * Columns the interviewer detail view renders. The server's initial fetch and the
 * client's live poll both select exactly these, so the two stay a single source of truth.
 * Kept in a plain (non-'use client') module so the server component can import the value.
 */
export const INTERVIEW_DETAIL_COLUMNS =
  'id, candidate_email, candidate_name, status, created_at, transcript, code_snapshot, code_runs, evaluation_score, metrics_summary, duration_seconds';
