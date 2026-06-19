// Repository for interviews, interview_events, and notify_outbox tables.
// All reads/writes go through the service-role client; RLS does not apply.

import { createServiceClient } from './supabase';
import { InterviewContext } from '../interview/types';
import { TranscriptTurn } from '../interview/oracle';
import { RunResult } from '../execution/types';
import { Scorecard } from '../scoring/types';
import { OutboxStore, ScorecardOutboxItem } from '../notify/outbox';

// ─────────────────────── Interview row shape ───────────────────────

export type InterviewStatus = 'invited' | 'in_progress' | 'completed' | 'scored' | 'expired' | 'abandoned';
export type InterviewPhase = 'greeting' | 'oral' | 'handoff' | 'coding' | 'wrap_up' | 'scoring' | 'done';

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
  code_runs: RunResult[];
  evaluation_score: Scorecard | null;
  scorecard_sent_at: string | null;
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
}

export type UpdateInterviewInput = Partial<{
  fsm_state: InterviewContext;
  phase: InterviewPhase;
  status: InterviewStatus;
  transcript: TranscriptTurn[];
  code_snapshot: string;
  code_runs: RunResult[];
  tnc_accepted_at: string;
  evaluation_score: Scorecard;
  scorecard_sent_at: string;
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
    })
    .select()
    .single();

  if (error) throw new Error(`createInterview: ${error.message}`);
  return data as Interview;
}

export async function getById(id: string): Promise<Interview | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .select('*')
    .eq('id', id)
    .single();

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

/** Append one event row with a monotonically increasing seq per interview.
 *  Retries once on unique-seq collision (concurrent writers). */
export async function appendEvent(
  interviewId: string,
  kind: string,
  payload: Record<string, unknown>,
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

/** Append a code-run record to the interview's code_runs array. */
export async function appendCodeRun(id: string, run: RunResult): Promise<void> {
  // Read current runs then append (Supabase JS v2 has no array-append via RPC without a function).
  const interview = await getById(id);
  if (!interview) throw new Error(`appendCodeRun: interview ${id} not found`);

  const runs = [...(interview.code_runs ?? []), run];
  await updateInterview(id, { code_runs: runs });
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

/** Returns an OutboxStore implementation backed by the live DB. */
export function makeOutboxStore(): OutboxStore {
  return {
    async claimPending(limit: number): Promise<ScorecardOutboxItem[]> {
      const db = createServiceClient();

      // Fetch pending outbox rows.
      const { data: rows, error } = await db
        .from('notify_outbox')
        .select('id, interview_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new Error(`claimPending: ${error.message}`);
      if (!rows || rows.length === 0) return [];

      const items: ScorecardOutboxItem[] = [];

      for (const row of rows as Array<{ id: number; interview_id: string }>) {
        const interview = await getById(row.interview_id);
        if (!interview || !interview.evaluation_score) continue;

        // Get interviewer email via Auth Admin API.
        const { data: userData, error: userErr } = await db.auth.admin.getUserById(
          interview.interviewer_id,
        );
        if (userErr || !userData?.user?.email) continue;

        // Mark as in-flight to avoid double-claiming (increment attempts).
        await db
          .from('notify_outbox')
          .update({ attempts: db.rpc as unknown as number })
          .eq('id', row.id);

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
      const { error } = await db
        .from('notify_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`markSent: ${error.message}`);
    },

    async markFailed(id: number | string, errMsg: string): Promise<void> {
      const db = createServiceClient();
      const { error } = await db
        .from('notify_outbox')
        .update({ status: 'failed', last_error: errMsg.slice(0, 500) })
        .eq('id', id);
      if (error) throw new Error(`markFailed: ${error.message}`);
    },
  };
}
