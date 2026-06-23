// Repository for interviews, interview_events, and notify_outbox tables.
// All reads/writes go through the service-role client; RLS does not apply.

import { createServiceClient } from './supabase';
import { InterviewContext } from '../interview/types';
import { TranscriptTurn } from '../interview/oracle';
import { RunResult } from '../execution/types';
import { Scorecard } from '../scoring/types';
import { OutboxStore, ScorecardOutboxItem } from '../notify/outbox';

// ─────────────────────── Interview row shape ───────────────────────

export type InterviewStatus =
  | 'invited'
  | 'in_progress'
  | 'completed'
  | 'scored'
  | 'expired'
  | 'abandoned'
  | 'cancelled';
export type InterviewPhase =
  | 'greeting'
  | 'oral'
  | 'handoff'
  | 'coding'
  | 'wrap_up'
  | 'scoring'
  | 'done';

export interface Interview {
  id: string;
  interviewer_id: string;
  candidate_email: string;
  candidate_name: string | null;
  status: InterviewStatus;
  phase: InterviewPhase;
  fsm_state: InterviewContext;
  access_token_hash: string | null;
  token_expires_at: string | null;
  tnc_accepted_at: string | null;
  tnc_version: string | null;
  transcript: TranscriptTurn[];
  code_snapshot: string;
  /** Interviewer's chosen room language, set at creation; null = candidate chooses. */
  assigned_language: string | null;
  code_language: string | null;
  code_runs: RunResult[];
  evaluation_score: Scorecard | null;
  scorecard_sent_at: string | null;
  last_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInterviewInput {
  interviewerId: string;
  candidateEmail: string;
  candidateName?: string;
  accessTokenHash: string;
  tokenExpiresAt: Date;
  fsmState: InterviewContext;
  /** Interviewer's chosen room language; omit/null for "candidate chooses". */
  assignedLanguage?: string | null;
}

export type UpdateInterviewInput = Partial<{
  fsm_state: InterviewContext;
  phase: InterviewPhase;
  status: InterviewStatus;
  transcript: TranscriptTurn[];
  code_snapshot: string;
  code_language: string;
  code_runs: RunResult[];
  tnc_accepted_at: string;
  tnc_version: string;
  access_token_hash: string;
  token_expires_at: string;
  evaluation_score: Scorecard;
  scorecard_sent_at: string;
  last_request_id: string;
}>;

// ─────────────────────── Repository functions ───────────────────────

export async function createInterview(input: CreateInterviewInput): Promise<Interview> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .insert({
      interviewer_id: input.interviewerId,
      candidate_email: input.candidateEmail,
      candidate_name: input.candidateName ?? null,
      access_token_hash: input.accessTokenHash,
      token_expires_at: input.tokenExpiresAt.toISOString(),
      fsm_state: input.fsmState as unknown as Record<string, unknown>,
      status: 'invited',
      phase: 'greeting',
      transcript: [],
      code_snapshot: '',
      code_runs: [],
      assigned_language: input.assignedLanguage ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createInterview: ${error.message}`);
  return data as Interview;
}

export async function getById(id: string): Promise<Interview | null> {
  const db = createServiceClient();
  const { data, error } = await db.from('interviews').select('*').eq('id', id).single();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw new Error(`getById: ${error.message}`);
  return data as Interview;
}

export async function getByAccessTokenHash(hash: string): Promise<Interview | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .select('*')
    .eq('access_token_hash', hash)
    .single();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw new Error(`getByAccessTokenHash: ${error.message}`);
  return data as Interview;
}

export async function updateInterview(id: string, patch: UpdateInterviewInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from('interviews')
    .update(patch as Record<string, unknown>)
    .eq('id', id);

  if (error) throw new Error(`updateInterview: ${error.message}`);
}

/** Hard-delete an interview row (cascades to interview_events + notify_outbox). */
export async function deleteInterview(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from('interviews').delete().eq('id', id);
  if (error) throw new Error(`deleteInterview: ${error.message}`);
}

/** Append one event row with a monotonically increasing seq per interview.
 *  Retries once on unique-seq collision (concurrent writers). */
export async function appendEvent(
  interviewId: string,
  kind: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = createServiceClient();

  const insert = async (): Promise<void> => {
    // Compute next seq as max(seq)+1 for this interview.
    const { data: rows, error: seqErr } = await db
      .from('interview_events')
      .select('seq')
      .eq('interview_id', interviewId)
      .order('seq', { ascending: false })
      .limit(1);

    if (seqErr) throw new Error(`appendEvent seq query: ${seqErr.message}`);

    const nextSeq = rows && rows.length > 0 ? (rows[0] as { seq: number }).seq + 1 : 0;

    const { error } = await db.from('interview_events').insert({
      interview_id: interviewId,
      seq: nextSeq,
      kind,
      payload,
    });

    if (error) throw error;
  };

  try {
    await insert();
  } catch (err: unknown) {
    // Retry once on unique constraint violation (race on seq).
    const pgErr = err as { code?: string; message?: string };
    if (pgErr?.code === '23505') {
      await insert();
    } else {
      throw new Error(`appendEvent: ${pgErr?.message ?? String(err)}`);
    }
  }
}

/** Atomically persist a code run: append it to code_runs AND set code_snapshot +
 *  code_language, all in one UPDATE (the append_code_run Postgres function, under a
 *  row-level write lock). Doing the three writes together means concurrent runs can
 *  neither lose an append nor leave code_runs[-1] describing a different run than
 *  code_snapshot — unlike the old read-modify-write + separate snapshot update. */
export async function appendCodeRun(
  id: string,
  run: RunResult,
  snapshot: string,
  language: string
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.rpc('append_code_run', {
    p_id: id,
    p_run: run as unknown as Record<string, unknown>,
    p_snapshot: snapshot,
    p_language: language,
  });
  if (error) throw new Error(`appendCodeRun: ${error.message}`);
}

/** Atomically claim an in-progress interview for scoring (single-flight). Returns true only
 *  for the caller that flipped status in_progress -> completed; concurrent callers get false. */
export async function claimForScoring(id: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .update({ status: 'completed' })
    .eq('id', id)
    .eq('status', 'in_progress')
    .select('id');
  if (error) throw new Error(`claimForScoring: ${error.message}`);
  return !!data && data.length > 0;
}

/** Grace window after expiry before the sweep may close an interview. Any row touched within
 *  this window (a finishing candidate's answer, or an in-flight re-score) is left alone, so the
 *  sweep can't race claimForScoring at the TTL boundary. */
const SWEEP_GRACE_MS = 10 * 60 * 1000;

/** Stale interviews of a given status whose token expired AND that have been quiet for the
 *  grace window (candidate no-show / dropout). */
async function findStaleByStatus(status: InterviewStatus): Promise<Interview[]> {
  const db = createServiceClient();
  const now = Date.now();
  const { data, error } = await db
    .from('interviews')
    .select('*')
    .eq('status', status)
    .lt('token_expires_at', new Date(now).toISOString())
    .lt('updated_at', new Date(now - SWEEP_GRACE_MS).toISOString());
  if (error) throw new Error(`findStale ${status}: ${error.message}`);
  return (data ?? []) as Interview[];
}

/** Invited interviews past their TTL — the candidate never started (no-show). */
export function findStaleInvited(): Promise<Interview[]> {
  return findStaleByStatus('invited');
}

/** In-progress interviews past their TTL — the candidate started but never finished (dropout). */
export function findStaleInProgress(): Promise<Interview[]> {
  return findStaleByStatus('in_progress');
}

/** Atomically claim a stale interview for closing (single-flight CAS, like claimForScoring).
 *  Returns true only for the caller that flips `from` -> `to`; concurrent sweeps get false. */
async function claimStatus(
  id: string,
  from: InterviewStatus,
  to: InterviewStatus
): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .update({ status: to })
    .eq('id', id)
    .eq('status', from)
    .select('id');
  if (error) throw new Error(`claimStatus ${from}->${to}: ${error.message}`);
  return !!data && data.length > 0;
}

/** Claim a no-show: invited -> expired. */
export function claimExpire(id: string): Promise<boolean> {
  return claimStatus(id, 'invited', 'expired');
}

/** Claim a dropout: in_progress -> abandoned. */
export function claimAbandon(id: string): Promise<boolean> {
  return claimStatus(id, 'in_progress', 'abandoned');
}

// ─────────────────────── Outbox store implementation ───────────────────────

/** Insert a pending outbox row for the given interview. */
export async function insertOutbox(interviewId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from('notify_outbox').insert({
    interview_id: interviewId,
    kind: 'scorecard',
    status: 'pending',
    attempts: 0,
  });

  if (error) throw new Error(`insertOutbox: ${error.message}`);
}

/** Cap on delivery attempts before an outbox row is permanently marked failed. */
const MAX_OUTBOX_ATTEMPTS = 5;

/** Returns an OutboxStore implementation backed by the live DB. */
export function makeOutboxStore(): OutboxStore {
  return {
    async claimPending(limit: number): Promise<ScorecardOutboxItem[]> {
      const db = createServiceClient();

      const { data: rows, error } = await db
        .from('notify_outbox')
        .select('id, interview_id, attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new Error(`claimPending: ${error.message}`);
      if (!rows || rows.length === 0) return [];

      const items: ScorecardOutboxItem[] = [];

      for (const row of rows as Array<{ id: number; interview_id: string; attempts: number }>) {
        // Give up after too many tries so a permanently-failing row can't loop forever.
        if (row.attempts >= MAX_OUTBOX_ATTEMPTS) {
          await db.from('notify_outbox').update({ status: 'failed' }).eq('id', row.id);
          continue;
        }

        // Compare-and-swap claim: bump attempts only from the value we just read. If the
        // conditional update matches no row, another drainer already claimed it — skip,
        // so the same scorecard email is never sent twice.
        const { data: claimed, error: claimErr } = await db
          .from('notify_outbox')
          .update({ attempts: row.attempts + 1 })
          .eq('id', row.id)
          .eq('status', 'pending')
          .eq('attempts', row.attempts)
          .select('id');

        if (claimErr) throw new Error(`claimPending claim: ${claimErr.message}`);
        if (!claimed || claimed.length === 0) continue;

        const interview = await getById(row.interview_id);
        if (!interview || !interview.evaluation_score) continue;

        // Get interviewer email via Auth Admin API.
        const { data: userData, error: userErr } = await db.auth.admin.getUserById(
          interview.interviewer_id
        );
        if (userErr || !userData?.user?.email) continue;

        items.push({
          id: row.id,
          interviewId: interview.id,
          interviewerEmail: userData.user.email,
          candidateEmail: interview.candidate_email,
          candidateName: interview.candidate_name ?? undefined,
          scorecard: interview.evaluation_score,
        });
      }

      return items;
    },

    async markSent(id: number | string): Promise<void> {
      const db = createServiceClient();
      const sentAt = new Date().toISOString();
      const { data, error } = await db
        .from('notify_outbox')
        .update({ status: 'sent', sent_at: sentAt })
        .eq('id', id)
        .select('interview_id')
        .single();
      if (error) throw new Error(`markSent: ${error.message}`);
      // Close the idempotency loop on the interview row too.
      if (data?.interview_id) {
        await updateInterview(data.interview_id as string, { scorecard_sent_at: sentAt });
      }
    },

    async markFailed(id: number | string, errMsg: string): Promise<void> {
      const db = createServiceClient();
      // Return to 'pending' so the next drain retries; the attempts cap in claimPending
      // eventually marks a permanently-failing row as 'failed'.
      const { error } = await db
        .from('notify_outbox')
        .update({ status: 'pending', last_error: errMsg.slice(0, 500) })
        .eq('id', id);
      if (error) throw new Error(`markFailed: ${error.message}`);
    },
  };
}
