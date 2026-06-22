// Deterministic scoring pass — runs ONCE after the interview, over the recorded
// transcript + code, via a pinned Minimax call (temperature 0, fixed rubric). This
// is separate from the live conversational LLM: the conversation never grades; this
// pass does, reproducibly. Malformed/transport failures yield a safe, explicit
// fallback (never throws into the FSM).

import { MinimaxClient, ChatMessage } from '../interview/minimax';
import { TranscriptTurn } from '../interview/oracle';
import { Scorecard, ScoreDimension, RECOMMENDATIONS, Recommendation } from './types';

export interface CodeRunSummary {
  language: string;
  status: string;
  stderr?: string;
}

export interface ScoringInput {
  transcript: TranscriptTurn[];
  codeRuns: CodeRunSummary[];
  finalCode?: string;
}

const RUBRIC_SYSTEM =
  'You are a strict, consistent technical-interview grader. Score 0–5 on each of: ' +
  'problem_solving, code_quality, communication, depth. Respond ONLY with strict JSON: ' +
  '{"overall": number, "recommendation": "strong_hire"|"hire"|"lean_hire"|"no_hire", ' +
  '"dimensions":[{"name":string,"score":number,"notes":string}], "summary": string}.';

export async function scoreInterview(
  input: ScoringInput,
  client: MinimaxClient
): Promise<Scorecard> {
  const messages: ChatMessage[] = [
    { role: 'system', content: RUBRIC_SYSTEM },
    { role: 'user', content: buildScoringPrompt(input) },
  ];
  try {
    const raw = await client.complete(messages, { json: true, temperature: 0, maxTokens: 800 });
    return validateScorecard(JSON.parse(raw));
  } catch {
    return fallbackScorecard();
  }
}

export function buildScoringPrompt(input: ScoringInput): string {
  const transcript = input.transcript.map((t) => `${t.role}: ${t.text}`).join('\n');
  const runs = input.codeRuns
    .map(
      (r) => `- ${r.language}: ${r.status}${r.stderr ? ` (stderr: ${r.stderr.slice(0, 120)})` : ''}`
    )
    .join('\n');
  return [
    `TRANSCRIPT:\n${transcript || '(none)'}`,
    input.finalCode ? `FINAL CODE:\n${input.finalCode.slice(0, 4000)}` : '',
    runs ? `CODE RUNS:\n${runs}` : '',
    'Grade per the rubric. Return the JSON only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const clamp05 = (n: unknown): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(5, x));
};

export function validateScorecard(raw: unknown): Scorecard {
  const o = (raw ?? {}) as Partial<Scorecard>;
  const recommendation: Recommendation = RECOMMENDATIONS.includes(
    o.recommendation as Recommendation
  )
    ? (o.recommendation as Recommendation)
    : 'no_hire';
  const dimensions: ScoreDimension[] = Array.isArray(o.dimensions)
    ? o.dimensions.map((d) => ({
        name: typeof d?.name === 'string' ? d.name : 'unknown',
        score: clamp05(d?.score),
        notes: typeof d?.notes === 'string' ? d.notes : '',
      }))
    : [];
  return {
    overall: clamp05(o.overall),
    recommendation,
    dimensions,
    summary: typeof o.summary === 'string' ? o.summary : '',
    scoringFailed: false,
  };
}

export function fallbackScorecard(): Scorecard {
  return {
    overall: 0,
    recommendation: 'no_hire',
    dimensions: [],
    summary: 'Automatic scoring was unavailable; manual review required.',
    scoringFailed: true,
  };
}
