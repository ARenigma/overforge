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
  /** Interviewer-chosen seniority level (junior/mid/senior/staff); calibrates questions + scoring. */
  level: string;
  /** Free-text role/JD context, set at creation; tailors questions + grading. */
  role_brief: string | null;
  /** A dev/testing interview (created by a DEV_EMAILS account): paste allowed + short duration. */
  dev_mode: boolean;
  code_language: string | null;
  code_runs: RunResult[];
  /** Ordered slugs of the coding problems assigned at creation (index = coding question). */
  coding_problem_ids: string[];
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
  /** Interviewer-chosen seniority level; defaults to 'mid' if omitted. */
  level?: string;
  /** Free-text role/JD context; tailors questions + grading. */
  roleBrief?: string | null;
  /** Dev/testing interview (server only honors this for DEV_EMAILS accounts). */
  devMode?: boolean;
  /** Slugs of the coding problems assigned to this interview (one per coding question). */
  codingProblemIds?: string[];
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
      ...(input.level ? { level: input.level } : {}),
      role_brief: input.roleBrief ?? null,
      dev_mode: input.devMode ?? false,
      coding_problem_ids: input.codingProblemIds ?? [],
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

/**
 * Hard-delete all interviews whose created_at is before cutoffIso AND whose status
 * is one of the supplied terminal statuses.
 *
 * CASCADE behaviour (confirmed in migrations):
 *   - interview_events      — ON DELETE CASCADE (migration 0001)
 *   - notify_outbox         — ON DELETE CASCADE (migration 0001)
 *   - voice_turn_telemetry  — ON DELETE CASCADE (migration 0010)
 *   - proctor_signals       — ON DELETE CASCADE (migration 0011)
 * No explicit child-row cleanup is required; the single interview delete covers all.
 *
 * Returns the number of rows deleted.
 */
export async function deleteInterviewsOlderThan(
  cutoffIso: string,
  statuses: InterviewStatus[]
): Promise<number> {
  const db = createServiceClient();
  const { error, count } = await db
    .from('interviews')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffIso)
    .in('status', statuses);
  if (error) throw new Error(`deleteInterviewsOlderThan: ${error.message}`);
  const deleted = count ?? 0;
  console.log(`[purge] deleted ${deleted} interview(s) created before ${cutoffIso}`);
  return deleted;
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

/** Atomically append a synthetic run to code_runs WITHOUT touching code_snapshot / code_language.
 *  Used for Path-B idle check-ins (status:'Idle'), which carry no candidate source and must never
 *  overwrite the last real editor snapshot the scorer reads. Same row-level lock as appendCodeRun. */
export async function appendCodeRunOnly(id: string, run: RunResult): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.rpc('append_code_run_only', {
    p_id: id,
    p_run: run as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(`appendCodeRunOnly: ${error.message}`);
}

/**
 * Best-effort read-modify-write: patch the `intervention` field on the most recent code_run
 * for an interview. Used by the async run-wording path (§6) to backfill the intervention after
 * the /run response has already been sent. Never throws — callers fire-and-forget this.
 */
export async function updateLastRunIntervention(
  id: string,
  intervention: { text: string; kind: string }
): Promise<void> {
  const db = createServiceClient();
  const { data, error: readErr } = await db
    .from('interviews')
    .select('code_runs')
    .eq('id', id)
    .single();
  if (readErr || !data) throw new Error(`updateLastRunIntervention read: ${readErr?.message}`);
  const runs = ((data as { code_runs?: unknown[] }).code_runs ?? []) as RunResult[];
  if (runs.length === 0) return;
  // Clear interventionPending so subsequent nudge checks are not blocked by a stale true.
  const patched = [
    ...runs.slice(0, -1),
    { ...runs[runs.length - 1], intervention, interventionPending: false },
  ];
  const { error: writeErr } = await db
    .from('interviews')
    .update({ code_runs: patched as unknown as Record<string, unknown>[] })
    .eq('id', id);
  if (writeErr) throw new Error(`updateLastRunIntervention write: ${writeErr.message}`);
}

/** Clear the interventionPending flag on the last code run when the outcome is 'none' (no
 *  intervention warranted). Without this, the flag stays true and blocks every subsequent
 *  nudge check — the candidate can never receive a second intervention after the first run
 *  that produced no action. */
export async function clearLastRunInterventionPending(id: string): Promise<void> {
  const db = createServiceClient();
  const { data, error: readErr } = await db
    .from('interviews')
    .select('code_runs')
    .eq('id', id)
    .single();
  if (readErr || !data) throw new Error(`clearLastRunInterventionPending read: ${readErr?.message}`);
  const runs = ((data as { code_runs?: unknown[] }).code_runs ?? []) as RunResult[];
  if (runs.length === 0) return;
  const last = runs[runs.length - 1];
  if (!last.interventionPending) return; // already clear — skip the write
  const patched = [...runs.slice(0, -1), { ...last, interventionPending: false }];
  const { error: writeErr } = await db
    .from('interviews')
    .update({ code_runs: patched as unknown as Record<string, unknown>[] })
    .eq('id', id);
  if (writeErr) throw new Error(`clearLastRunInterventionPending write: ${writeErr.message}`);
}

/** Atomically claim an invited interview for begin (single-flight CAS). Sets status to
 *  'in_progress' AND writes the rotated session-token + T&C fields in one UPDATE WHERE
 *  status='invited'. Returns true only for the caller that performed the flip; a concurrent
 *  /begin caller that races here will find the row already transitioned and gets false.
 *
 *  This closes the double-begin race: two concurrent requests both pass the optimistic
 *  `status !== 'invited'` read, but only one can win the CAS — the loser's session token is
 *  never persisted, so there is no window for session theft via a forwarded invite link. */
export async function claimBegin(
  id: string,
  patch: {
    tnc_accepted_at: string;
    tnc_version: string;
    access_token_hash: string;
    token_expires_at: string;
  }
): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .update({ status: 'in_progress' as InterviewStatus, ...patch })
    .eq('id', id)
    .eq('status', 'invited')
    .select('id');
  if (error) throw new Error(`claimBegin: ${error.message}`);
  return !!data && data.length > 0;
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

/** In-progress interviews past the interview duration (started ≥ durationCutoff ago) that have
 *  been quiet for the grace window — ready to be auto-concluded + scored. The duration cutoff
 *  (now − INTERVIEW_DURATION) is computed by the caller, which owns the env; the grace check is
 *  on updated_at so an actively-answering candidate is never swept out from under themselves.
 *  Dev and prod interviews have different caps, so the caller filters by `devMode` and passes the
 *  matching cutoff — otherwise a 2-min dev interview would wait the full 60-min prod window. */
export async function findInProgressPastDuration(
  durationCutoffIso: string,
  devMode?: boolean
): Promise<Interview[]> {
  const db = createServiceClient();
  let query = db
    .from('interviews')
    .select('*')
    .eq('status', 'in_progress')
    .lt('tnc_accepted_at', durationCutoffIso)
    .lt('updated_at', new Date(Date.now() - SWEEP_GRACE_MS).toISOString());
  if (devMode !== undefined) {
    query = query.eq('dev_mode', devMode);
  }
  const { data, error } = await query;
  if (error) throw new Error(`findInProgressPastDuration: ${error.message}`);
  return (data ?? []) as Interview[];
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

/**
 * Find interviews stranded in 'completed' (claimForScoring flipped in_progress→completed but
 * the scoring process crashed before it could write the scorecard). Rows older than
 * staleCutoffIso are eligible for a re-score sweep.
 */
export async function findStuckCompleted(staleCutoffIso: string): Promise<Interview[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('interviews')
    .select('*')
    .eq('status', 'completed')
    .lt('updated_at', staleCutoffIso);
  if (error) throw new Error(`findStuckCompleted: ${error.message}`);
  return (data ?? []) as Interview[];
}

/**
 * CAS: flip a stranded 'completed' row back to 'in_progress' so finishAndScore can
 * re-claim it via the normal claimForScoring path. Returns true only for the caller
 * that performed the flip (single-flight guarantee).
 */
export function claimCompletedForRescore(id: string): Promise<boolean> {
  return claimStatus(id, 'completed', 'in_progress');
}

// ─────────────────────── Voice turn telemetry ───────────────────────

export interface VoiceTurnRecord {
  requestId: string | null | undefined;
  commit: string;
  audioS: number | null | undefined;
  sttMs: number | null | undefined;
  oracleMs: number | null | undefined;
  ttsMs: number | null | undefined;
  gapMs: number | null | undefined;
  phase: string | null | undefined;
  empty: boolean;
  terminal: boolean;
  /** Primary-engine transcript for this turn — the pairwise reference for A/B disagreement. */
  primaryTranscript?: string | null;
  /** Shadow STT engine run in parallel on the same audio (e.g. "soniox"); null when none ran. */
  shadowEngine?: string | null;
  /** Shadow transcript for the same audio window as primaryTranscript (log-only). */
  shadowTranscript?: string | null;
  /** Rough shadow finalization latency (ms). */
  shadowSttMs?: number | null;
  /** ms from window start to the shadow's first semantic endpoint (its EOT); null if none fired. */
  shadowEndpointMs?: number | null;
  /** Count of shadow semantic endpoints in the window (0 = never ended; >=2 = would have split). */
  shadowEndpointCount?: number | null;
  /** Browser-measured TTFB: ms from turn_ready receipt to first PCM sample played. Null when the
   *  client didn't report it (older client) or TTS failed before any audio played. */
  firstAudioMs?: number | null;
}

/** Insert one voice-turn telemetry row.  Throws on DB error (the route swallows it). */
export async function recordVoiceTurn(interviewId: string, t: VoiceTurnRecord): Promise<void> {
  const db = createServiceClient();

  // Defensively coerce numeric fields: clamp negatives to 0, treat NaN/Inf as null.
  const safeNum = (v: number | null | undefined): number | null => {
    if (v == null || !isFinite(v)) return null;
    return Math.max(0, v);
  };

  const { error } = await db.from('voice_turn_telemetry').insert({
    interview_id: interviewId,
    request_id: t.requestId ?? null,
    commit_kind: t.commit,
    audio_s: safeNum(t.audioS),
    stt_ms: safeNum(t.sttMs),
    oracle_ms: safeNum(t.oracleMs),
    tts_ms: safeNum(t.ttsMs),
    gap_ms: safeNum(t.gapMs),
    phase: t.phase ?? null,
    empty: t.empty,
    terminal: t.terminal,
    primary_transcript: t.primaryTranscript ?? null,
    shadow_engine: t.shadowEngine ?? null,
    shadow_transcript: t.shadowTranscript ?? null,
    shadow_stt_ms: safeNum(t.shadowSttMs),
    shadow_endpoint_ms: safeNum(t.shadowEndpointMs),
    shadow_endpoint_count: t.shadowEndpointCount == null ? null : Math.round(t.shadowEndpointCount),
    first_audio_ms: safeNum(t.firstAudioMs),
  });

  if (error) throw new Error(`recordVoiceTurn: ${error.message}`);
}

// ─────────────────────── Voice turn shadow rows ───────────────────────

/** One shadow engine's per-turn observation; maps 1:1 to voice_turn_shadows columns. */
export interface VoiceTurnShadowRecord {
  engine: string;
  transcript?: string | null;
  sttMs?: number | null;
  endpointMs?: number | null;
  endpointCount?: number | null;
  finalizeLagMs?: number | null;
  secondVoiceMs?: number | null;
  speakerCount?: number | null;
}

/**
 * Bulk-insert shadow observations for one turn into voice_turn_shadows.
 * No-ops when the shadows array is empty. Throws on DB error (route swallows).
 */
export async function recordVoiceTurnShadows(
  interviewId: string,
  requestId: string,
  shadows: VoiceTurnShadowRecord[]
): Promise<void> {
  if (shadows.length === 0) return;
  const db = createServiceClient();

  const safeNum = (v: number | null | undefined): number | null => {
    if (v == null || !isFinite(v)) return null;
    return Math.max(0, v);
  };

  const rows = shadows.map((s) => ({
    interview_id: interviewId,
    request_id: requestId,
    engine: s.engine,
    transcript: s.transcript ?? null,
    stt_ms: safeNum(s.sttMs),
    endpoint_ms: safeNum(s.endpointMs),
    endpoint_count: s.endpointCount == null ? null : Math.round(s.endpointCount),
    finalize_lag_ms: safeNum(s.finalizeLagMs),
    second_voice_ms: safeNum(s.secondVoiceMs),
    speaker_count: s.speakerCount == null ? null : Math.round(s.speakerCount),
  }));

  const { error } = await db.from('voice_turn_shadows').insert(rows);
  if (error) throw new Error(`recordVoiceTurnShadows: ${error.message}`);
}

// ─────────────────────── Proctor signals ───────────────────────

export interface ProctorSignalRecord {
  windowMs: number;
  samples: number;
  faceAbsentMs: number;
  multiFaceMs: number;
  gazeOffMs: number;
  maxFaces: number;
}

export interface ProctorAggregate {
  monitoredMs: number;
  faceAbsentMs: number;
  multiFaceMs: number;
  gazeOffMs: number;
  maxFaces: number;
  everMultiFace: boolean;
}

/** Insert one proctor-signal window row. Throws on DB error (the route swallows it). */
export async function recordProctorSignal(
  interviewId: string,
  s: ProctorSignalRecord
): Promise<void> {
  const db = createServiceClient();

  // Defensively coerce integer fields: clamp negatives to 0, treat non-finite as 0.
  const safeInt = (v: number): number => {
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.round(v));
  };

  const { error } = await db.from('proctor_signals').insert({
    interview_id: interviewId,
    window_ms: safeInt(s.windowMs),
    samples: safeInt(s.samples),
    face_absent_ms: safeInt(s.faceAbsentMs),
    multi_face_ms: safeInt(s.multiFaceMs),
    gaze_off_ms: safeInt(s.gazeOffMs),
    max_faces: safeInt(s.maxFaces),
  });

  if (error) throw new Error(`recordProctorSignal: ${error.message}`);
}

/** Aggregate all proctor-signal windows for an interview into a single summary. */
export async function getProctorSignalsForInterview(
  interviewId: string
): Promise<ProctorAggregate> {
  const db = createServiceClient();

  const { data, error } = await db
    .from('proctor_signals')
    .select('window_ms, face_absent_ms, multi_face_ms, gaze_off_ms, max_faces')
    .eq('interview_id', interviewId);

  if (error) throw new Error(`getProctorSignalsForInterview: ${error.message}`);

  const rows = (data ?? []) as Array<{
    window_ms: number | null;
    face_absent_ms: number | null;
    multi_face_ms: number | null;
    gaze_off_ms: number | null;
    max_faces: number | null;
  }>;

  let monitoredMs = 0;
  let faceAbsentMs = 0;
  let multiFaceMs = 0;
  let gazeOffMs = 0;
  let maxFaces = 0;
  let everMultiFace = false;

  for (const row of rows) {
    monitoredMs += row.window_ms ?? 0;
    faceAbsentMs += row.face_absent_ms ?? 0;
    multiFaceMs += row.multi_face_ms ?? 0;
    gazeOffMs += row.gaze_off_ms ?? 0;
    const rowMax = row.max_faces ?? 0;
    if (rowMax > maxFaces) maxFaces = rowMax;
    if (rowMax > 1) everMultiFace = true;
  }

  return { monitoredMs, faceAbsentMs, multiFaceMs, gazeOffMs, maxFaces, everMultiFace };
}

// ─────────────────────── Integrity signals ───────────────────────

/** The full set of valid integrity signal kinds (must match the DB CHECK constraint). */
export const INTEGRITY_SIGNAL_KINDS = new Set([
  'second_voice',
  'blur',
  'hidden',
  'fullscreen_exit',
  'paste_blocked',
  'multi_monitor',
] as const);

export type IntegritySignalKind = typeof INTEGRITY_SIGNAL_KINDS extends Set<infer T> ? T : never;

export interface IntegritySignalRecord {
  kind: string;
  /** Duration of the signal event in ms (e.g. non-primary speaker ms for second_voice). */
  durationMs?: number | null;
  /** Opaque advisory detail — max 2 KB; never contains audio, video, or biometric data. */
  detail?: Record<string, unknown>;
}

export interface SecondVoiceSummary {
  /** Number of turns in which more than one speaker was detected. */
  turnCount: number;
  /** Total ms attributed to non-primary speakers across all turns. */
  totalDurationMs: number;
}

/** Insert one integrity-signal row. Throws on DB error (the route/handler swallows it). */
export async function recordIntegritySignal(
  interviewId: string,
  s: IntegritySignalRecord
): Promise<void> {
  const db = createServiceClient();

  // Defensive: reject unknown kinds at the application layer before hitting the DB constraint.
  if (!INTEGRITY_SIGNAL_KINDS.has(s.kind as IntegritySignalKind)) {
    throw new Error(`recordIntegritySignal: unknown kind "${s.kind}"`);
  }

  // Cap detail payload to prevent runaway blobs (advisory info only; detail is never load-bearing).
  const rawDetail = s.detail ?? {};
  const detailStr = JSON.stringify(rawDetail);
  const detail = detailStr.length <= 2048 ? rawDetail : {};

  const { error } = await db.from('integrity_signals').insert({
    interview_id: interviewId,
    kind: s.kind,
    ...(s.durationMs != null && isFinite(s.durationMs)
      ? { duration_ms: Math.max(0, Math.round(s.durationMs)) }
      : {}),
    detail,
  });

  if (error) throw new Error(`recordIntegritySignal: ${error.message}`);
}

/** Aggregate all 'second_voice' integrity signals for an interview into a summary for the scorecard.
 *  Best-effort: callers swallow the error so a fetch failure never blocks scoring. */
export async function getSecondVoiceSignals(
  interviewId: string
): Promise<SecondVoiceSummary> {
  const db = createServiceClient();

  const { data, error } = await db
    .from('integrity_signals')
    .select('duration_ms')
    .eq('interview_id', interviewId)
    .eq('kind', 'second_voice');

  if (error) throw new Error(`getSecondVoiceSignals: ${error.message}`);

  const rows = (data ?? []) as Array<{ duration_ms: number | null }>;
  return {
    turnCount: rows.length,
    totalDurationMs: rows.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0),
  };
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
const MAX_OUTBOX_ATTEMPTS = 8;

/** Returns an OutboxStore implementation backed by the live DB. */
export function makeOutboxStore(): OutboxStore {
  return {
    async claimPending(limit: number): Promise<ScorecardOutboxItem[]> {
      const db = createServiceClient();

      const { data: rows, error } = await db
        .from('notify_outbox')
        .select('id, interview_id, attempts, updated_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new Error(`claimPending: ${error.message}`);
      if (!rows || rows.length === 0) return [];

      const items: ScorecardOutboxItem[] = [];

      for (const row of rows as Array<{
        id: number;
        interview_id: string;
        attempts: number;
        updated_at: string | null;
      }>) {
        // Exponential backoff: next_eligible = updated_at + min(60s × 2^attempts, 1h).
        // Attempts=0 rows are freshly inserted and always eligible immediately (delay=60s but
        // they were just written so updated_at is now; actual first-try happens on next drain
        // cycle — acceptable). Rows that have failed and been returned to 'pending' wait.
        if (row.attempts > 0 && row.updated_at) {
          const delayMs = Math.min(60_000 * Math.pow(2, row.attempts), 3_600_000);
          const eligibleAt = new Date(row.updated_at).getTime() + delayMs;
          if (Date.now() < eligibleAt) continue; // not yet eligible — skip this drain cycle
        }

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
