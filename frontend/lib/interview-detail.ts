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
}

/**
 * Columns the interviewer detail view renders. The server's initial fetch and the
 * client's live poll both select exactly these, so the two stay a single source of truth.
 * Kept in a plain (non-'use client') module so the server component can import the value.
 */
export const INTERVIEW_DETAIL_COLUMNS =
  'id, candidate_email, candidate_name, status, created_at, transcript, code_snapshot, code_runs, evaluation_score';
