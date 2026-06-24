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
  /** Interviewer-chosen seniority level — the rubric is calibrated to it (a 'hire' at senior is
   *  a higher bar than at junior). */
  level?: string;
  /** Free-text role/JD context — grade relevance against what this role actually needs. */
  roleBrief?: string | null;
}

// Level-relative grading: the same answer should score differently by seniority.
const LEVEL_GRADING_GUIDANCE: Record<string, string> = {
  junior:
    'CANDIDATE LEVEL: JUNIOR. Grade against junior expectations — fundamentals and basic correctness clear the bar.',
  mid: 'CANDIDATE LEVEL: MID. Grade against mid-level expectations — correct solutions and awareness of tradeoffs.',
  senior:
    'CANDIDATE LEVEL: SENIOR. Grade against senior expectations — a "hire" requires strong design, edge cases, and justified tradeoffs.',
  staff:
    'CANDIDATE LEVEL: STAFF. Grade against staff expectations — systems thinking, rigor, and depth; the bar is high.',
};

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
  const levelLine =
    LEVEL_GRADING_GUIDANCE[(input.level ?? 'mid').toLowerCase()] ?? LEVEL_GRADING_GUIDANCE.mid;
  const brief = input.roleBrief?.trim();
  return [
    levelLine,
    brief ? `ROLE CONTEXT (judge relevance to this role):\n${brief.slice(0, 4000)}` : '',
    `TRANSCRIPT:\n${transcript || '(none)'}`,
    input.finalCode ? `FINAL CODE:\n${input.finalCode.slice(0, 4000)}` : '',
    runs ? `CODE RUNS:\n${runs}` : '',
    'Grade per the rubric, calibrated to the candidate level above. Return the JSON only.',
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
