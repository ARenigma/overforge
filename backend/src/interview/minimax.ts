// Single, pinned Minimax client + a Minimax-backed Oracle.
//
// This is the ONLY LLM wrapper in the system (all multi-provider code was deleted).
// The HTTP call targets Minimax's chat-completions API; the exact base URL / model
// are pinned via env and verified against the live account when credentials are
// staged (see docs/ARCHITECTURE_SPEC §4). Until then this typechecks and is unit-
// tested via the DeterministicOracle; live calls require MINIMAX_API_KEY.

import {
  Oracle,
  UtteranceRequest,
  Utterance,
  EvaluateRequest,
  InterventionRequest,
} from './oracle';
import { OracleDecision, InterventionKind, Effect } from './types';

// NOTE: MinimaxConfig + createMinimaxClient are OpenAI-compatible (Bearer auth, request shape, and
// {choices:[{message:{content}}]} response) — so the SAME client backs Groq (see groqConfigFromEnv);
// only the base URL / model / key (and an optional reasoning_effort) differ.
export interface MinimaxConfig {
  apiKey: string;
  model: string; // pinned, e.g. process.env.MINIMAX_LLM_MODEL
  baseUrl?: string; // default Minimax chat-completions endpoint
  groupId?: string; // some Minimax accounts require a GroupId
  reasoningEffort?: string; // gpt-oss on Groq: 'low' for lowest TTFT. Omitted for MiniMax (rejected).
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface MinimaxClient {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1/text/chatcompletion_v2';

/**
 * Model selection by role:
 *  - `fast` (oracle: questions / follow-ups / interventions — and future voice turns) →
 *    MINIMAX_FAST_MODEL (e.g. MiniMax-Text-01, ~1.7s TTFT). Conversational, low-latency.
 *  - default (scorer) → MINIMAX_LLM_MODEL (e.g. MiniMax-M3, a reasoning model) for careful,
 *    reproducible grading.
 * Falls back to MINIMAX_LLM_MODEL when MINIMAX_FAST_MODEL is unset, so it's a no-op until staged.
 */
export function minimaxConfigFromEnv(opts: { fast?: boolean } = {}): MinimaxConfig {
  const reasoningModel = process.env.MINIMAX_LLM_MODEL ?? '';
  return {
    apiKey: process.env.MINIMAX_API_KEY ?? '',
    model: opts.fast ? process.env.MINIMAX_FAST_MODEL || reasoningModel : reasoningModel,
    baseUrl: process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL,
    groupId: process.env.MINIMAX_GROUP_ID || undefined,
  };
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Groq-backed FAST-oracle config (OpenAI-compatible → reuses createMinimaxClient). Groq's LPU serves
 * GPT-OSS at ~0.5s TTFT — ~10x faster than MiniMax's reasoning model for real-time conversational
 * turns (measured: gpt-oss-120b ~0.55s TTFT, same as 20b). GROQ_MODEL is swappable (default
 * gpt-oss-120b; 'openai/gpt-oss-20b' as a lighter fallback) so models can be A/B'd from prod
 * voice.turn telemetry. reasoning_effort=low minimizes TTFT. The final scorecard grading stays on
 * MiniMax (see orchestrator getScoringClient) — split-brain: fast turns, deep async scoring.
 */
export function groqConfigFromEnv(): MinimaxConfig {
  return {
    apiKey: process.env.GROQ_API_KEY ?? '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    baseUrl: GROQ_BASE_URL,
    reasoningEffort: process.env.GROQ_REASONING_EFFORT || 'low',
  };
}

/** Real Minimax HTTP client (Node 20 global fetch). Throws clearly if unconfigured. */
export function createMinimaxClient(config: MinimaxConfig): MinimaxClient {
  return {
    async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
      if (!config.apiKey || !config.model) {
        throw new Error('Minimax is not configured: set MINIMAX_API_KEY and MINIMAX_LLM_MODEL.');
      }
      const url = config.groupId
        ? `${config.baseUrl}?GroupId=${encodeURIComponent(config.groupId)}`
        : (config.baseUrl as string);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: opts.temperature ?? 0.4,
          // Generous ceiling. MiniMax reasoning models spend hidden "thinking" tokens BEFORE the
          // visible answer; a low cap (was 512) let the reasoning eat the budget and truncate the
          // JSON mid-string — the scorer + evaluateAnswer then failed JSON.parse and fell back
          // (~half of prod scorings). max_tokens is only a ceiling: a well-behaved response stops
          // early, so this adds no cost when not needed, but lets a reasoning response complete.
          max_tokens: opts.maxTokens ?? 2048,
          // gpt-oss on Groq: 'low' keeps hidden reasoning (and TTFT) minimal. Only sent when set —
          // MiniMax rejects unknown params, so its config leaves reasoningEffort undefined.
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Minimax HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const data: unknown = await res.json();
      const content = extractContent(data);
      if (content == null) {
        throw new Error('Minimax response missing message content');
      }
      return content;
    },
  };
}

function extractContent(data: unknown): string | null {
  // Minimax (OpenAI-compatible) shape: { choices: [{ message: { content } }] }
  const d = data as { choices?: Array<{ message?: { content?: string } }> };
  return d?.choices?.[0]?.message?.content ?? null;
}

/** Oracle implementation backed by the pinned Minimax client. */
export class MinimaxOracle implements Oracle {
  constructor(private readonly client: MinimaxClient) {}

  async generateUtterance(req: UtteranceRequest): Promise<Utterance> {
    const expects = utteranceMode(req.effect.kind);
    const messages: ChatMessage[] = [
      { role: 'system', content: INTERVIEWER_SYSTEM },
      { role: 'user', content: buildUtterancePrompt(req) },
    ];
    const text = (await this.client.complete(messages, { temperature: 0.6 })).trim();
    return { text, expects };
  }

  async evaluateAnswer(req: EvaluateRequest): Promise<OracleDecision> {
    const messages: ChatMessage[] = [
      { role: 'system', content: EVALUATOR_SYSTEM },
      { role: 'user', content: buildEvaluatePrompt(req) },
    ];
    let raw = '';
    try {
      raw = await this.client.complete(messages, { json: true, temperature: 0 });
      return parseDecision(raw);
    } catch (err) {
      // Safe, bounded fallback: never loop on parse/transport failure. Log it so a persistent
      // misconfiguration (bad key/model) that silently disables follow-ups stays observable.
      console.error('[minimax] evaluateAnswer failed; advancing without follow-up:', err);
      return { followUp: false, reason: 'evaluator unavailable; advancing', signal: 0 };
    }
  }

  async generateIntervention(req: InterventionRequest): Promise<Utterance> {
    const messages: ChatMessage[] = [
      { role: 'system', content: INTERVENER_SYSTEM },
      { role: 'user', content: buildInterventionPrompt(req) },
    ];
    // Slightly cooler than utterance generation (a steer, not a fresh question). NO low token cap:
    // MiniMax M2 is a reasoning model, so a 160-token cap let the hidden reasoning eat the budget
    // and truncated the visible hint mid-sentence (seen in prod E2E). Use the client's default
    // headroom (512) like generateUtterance; the prompt already holds it to 1–2 sentences.
    const text = (await this.client.complete(messages, { temperature: 0.5 })).trim();
    return { text, expects: 'code' };
  }
}

const INTERVIEWER_SYSTEM =
  'You are a sharp, warm, professional technical interviewer. Speak in the first person, one ' +
  'short turn at a time. You have no name and represent no specific company — NEVER emit ' +
  'placeholders like "[Interviewer Name]" or "[Company]" (your turns are read ALOUD); just speak ' +
  'naturally without one. ' +
  'Run the session like a senior engineer doing a real technical screen: OPEN by having the ' +
  'candidate walk you through a substantial, recent project of THEIR OWN, then GRILL on it — dig ' +
  'into the specific design decisions, trade-offs, failure modes, and what they would do ' +
  'differently, following the thread that reveals the most. After probing their project, move to ' +
  'a couple of deeper conceptual, first-principles questions (ideally connected to what they ' +
  'described). Ask ONE focused thing per turn and build on their previous answer rather than ' +
  'reading from a script. ' +
  'Before each turn, judge whether the candidate ACTUALLY answered your previous question. If ' +
  'their reply is evasive, non-responsive, off-topic, gibberish, a flattering deflection (e.g. ' +
  '"nice question"), or empty of real substance, do NOT thank them or move on — briefly and ' +
  'politely note that it did not address the question and press again for the specific, concrete ' +
  'answer, naming what you still need. Only acknowledge and advance once they have genuinely ' +
  'answered. Stay warm, but hold the bar — never reward dodging. ' +
  'Never reveal scores or internal reasoning.';

const EVALUATOR_SYSTEM =
  'You judge a candidate answer for depth. Respond ONLY with strict JSON: ' +
  '{"followUp": boolean, "kind": "counter_question"|"probe"|"hint"|null, "reason": string, ' +
  '"signal": number between 0 and 1}. Set kind only when followUp is true: counter_question to ' +
  'challenge a questionable claim, probe to dig deeper on a thin answer, hint if they seem stuck.';

// The autonomous interviewer mid-problem. Balanced: present but not overbearing, and it NEVER
// hands over the solution — it guides the candidate to find it (so the signal stays the candidate's).
const INTERVENER_SYSTEM =
  'You are a balanced, senior technical interviewer stepping in mid-problem — present but not ' +
  'overbearing, like a real human interviewer. Speak in the first person, ONE short turn (1–2 ' +
  'sentences). Be specific and encouraging. NEVER write code or give away the solution; guide ' +
  'the candidate to reach it themselves. Never reveal scores or internal reasoning.';

const KIND_GUIDANCE: Record<InterventionKind, string> = {
  counter_question:
    'Challenge the claim or design choice the candidate just made — ask them to justify it. Do not give the answer.',
  probe:
    'The candidate seems stuck after repeated failing runs. Ask ONE focused question that makes them reason about WHY it is failing — do not tell them the fix.',
  hint: 'The candidate is still stuck. Give ONE small, concrete nudge toward the issue (e.g. the class of bug, or the specific case to consider) WITHOUT writing the fix or any code.',
  nudge:
    'Gently check in and invite the candidate to talk through their current approach in their own words.',
};

function buildInterventionPrompt(req: InterventionRequest): string {
  const recent = req.transcript
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  const runs = (req.recentRuns ?? [])
    .map((r) => `- ${r.status}${r.stderr ? ` (stderr: ${r.stderr.slice(0, 160)})` : ''}`)
    .join('\n');
  const brief = req.roleBrief?.trim();
  return [
    levelGuidance(req.level),
    brief ? `Role context:\n${brief.slice(0, 2000)}` : '',
    KIND_GUIDANCE[req.kind],
    req.code ? `Candidate's current code:\n${req.code.slice(0, 1500)}` : '',
    runs ? `Recent run results (oldest→newest):\n${runs}` : '',
    recent ? `Recent transcript:\n${recent}` : '',
    'Produce only your single short intervention.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function utteranceMode(kind: string): Utterance['expects'] {
  if (kind === 'ask_code' || kind === 'ask_followup') return 'code';
  if (kind === 'greet' || kind === 'ask_oral') return 'voice';
  return 'text';
}

// The full interview is short (~12 turns) and fits the model context comfortably, so the
// interviewer sees the whole conversation — earlier oral answers inform later questions.
const TRANSCRIPT_WINDOW = 40;

// Seniority calibration for question generation. Same level count for everyone (2 oral + 2
// coding, ≤3 follow-ups) — only the difficulty/depth of each question changes.
const LEVEL_QUESTION_GUIDANCE: Record<string, string> = {
  junior:
    'Target level: JUNIOR. Ask fundamentals-level questions; straightforward problems testing basic correctness and clear reasoning.',
  mid: 'Target level: MID. Ask solid working-engineer questions; expect correct solutions and awareness of basic tradeoffs.',
  senior:
    'Target level: SENIOR. Ask non-trivial questions; expect edge-case handling, sound design, and justified tradeoffs.',
  staff:
    'Target level: STAFF. Ask ambiguous/complex questions; expect systems thinking, rigor, and depth.',
};

function levelGuidance(level?: string): string {
  return LEVEL_QUESTION_GUIDANCE[(level ?? 'mid').toLowerCase()] ?? LEVEL_QUESTION_GUIDANCE.mid;
}

/** Per-effect steering so the interviewer runs project-first, then conceptual — see INTERVIEWER_SYSTEM.
 *  The FSM fixes WHICH effect fires (greet → ask_oral 0..n → coding); this shapes each into the
 *  project-first-then-grill-then-concept flow. */
function effectGuidance(effect: Effect): string {
  switch (effect.kind) {
    case 'greet':
      return (
        'OPENING turn: greet the candidate warmly in one sentence, then invite them to walk you ' +
        'through the most technically challenging project they have worked on recently — their OWN ' +
        'work. One inviting question.'
      );
    case 'ask_oral':
      return effect.index === 0
        ? 'Now GRILL them on the project they just described, like a senior engineer: pick the most ' +
            'revealing thread — a specific design decision, a hard trade-off, a bug/failure, or what ' +
            'they would do differently — and press for concrete specifics. One sharp question.'
        : 'Ask ONE deeper conceptual, first-principles question — ideally connected to the domain or ' +
            'a claim from their project — that tests genuine understanding, not memorization.';
    case 'ask_code':
      return 'Introduce a coding problem suited to their level; state it clearly and concisely.';
    case 'ask_followup':
      return 'Ask ONE focused follow-up that challenges their coding approach or reasoning.';
    case 'handoff':
      return 'Transition warmly from the discussion to the coding portion in one short line.';
    case 'wrap_up':
      return 'Wrap up warmly in one or two sentences.';
    default:
      return '';
  }
}

function buildUtterancePrompt(req: UtteranceRequest): string {
  const recent = req.transcript
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  const brief = req.roleBrief?.trim();
  const lastCandidate = [...req.transcript].reverse().find((t) => t.role === 'candidate')?.text;
  return [
    levelGuidance(req.level),
    brief
      ? `Role context (tailor questions to this role; keep the same count):\n${brief.slice(0, 4000)}`
      : '',
    `Phase: ${req.ctx.phase}. Next action: ${req.effect.kind}.`,
    effectGuidance(req.effect),
    req.code ? `Candidate code so far:\n${req.code.slice(0, 1500)}` : '',
    recent ? `Recent transcript:\n${recent}` : '',
    lastCandidate
      ? `The candidate's LAST reply was:\n"${lastCandidate.slice(0, 1200)}"\n` +
        'First decide: did this genuinely answer your previous question? If it dodged, was ' +
        'non-substantive, or off-topic, press for the specific instead of thanking them and moving on.'
      : '',
    "Produce only the interviewer's next utterance.",
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildEvaluatePrompt(req: EvaluateRequest): string {
  return [
    `Candidate answer:\n${req.answer}`,
    req.code ? `Their code:\n${req.code.slice(0, 1500)}` : '',
    'Does this answer warrant a deeper follow-up? Return the JSON only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const VALID_KINDS: readonly InterventionKind[] = ['counter_question', 'probe', 'hint', 'nudge'];

/**
 * Extract the first complete top-level JSON object from a model response.
 * Reasoning models sometimes wrap the JSON in markdown fences or emit a little prose around it
 * even in json_object mode; this strips fences and returns the first balanced `{...}` (string-aware,
 * so braces inside string values don't fool it). If the object is truncated (unbalanced — the
 * higher token ceiling should prevent this), it returns from the first `{` so JSON.parse throws a
 * clear error and the caller's safe fallback fires. Exported so the scorer reuses the same logic.
 */
export function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start === -1) return s;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

function parseDecision(raw: string): OracleDecision {
  const obj = JSON.parse(extractJsonObject(raw)) as Partial<OracleDecision>;
  const followUp = obj.followUp === true;
  const kind =
    followUp && VALID_KINDS.includes(obj.kind as InterventionKind)
      ? (obj.kind as InterventionKind)
      : undefined;
  return {
    followUp,
    reason: typeof obj.reason === 'string' ? obj.reason : '',
    signal: typeof obj.signal === 'number' ? Math.max(0, Math.min(1, obj.signal)) : 0,
    ...(kind ? { kind } : {}),
  };
}
