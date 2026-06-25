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
import { OracleDecision, InterventionKind } from './types';

export interface MinimaxConfig {
  apiKey: string;
  model: string; // pinned, e.g. process.env.MINIMAX_LLM_MODEL
  baseUrl?: string; // default Minimax chat-completions endpoint
  groupId?: string; // some Minimax accounts require a GroupId
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

export function minimaxConfigFromEnv(): MinimaxConfig {
  return {
    apiKey: process.env.MINIMAX_API_KEY ?? '',
    model: process.env.MINIMAX_LLM_MODEL ?? '',
    baseUrl: process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL,
    groupId: process.env.MINIMAX_GROUP_ID || undefined,
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
          max_tokens: opts.maxTokens ?? 512,
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
    // Slightly cooler than utterance generation (a steer, not a fresh question) and short-capped.
    const text = (
      await this.client.complete(messages, { temperature: 0.5, maxTokens: 160 })
    ).trim();
    return { text, expects: 'code' };
  }
}

const INTERVIEWER_SYSTEM =
  'You are a concise, warm, professional technical interviewer. Speak in the first ' +
  'person, one short turn at a time. Never reveal scores or internal reasoning.';

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

function buildUtterancePrompt(req: UtteranceRequest): string {
  const recent = req.transcript
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  const brief = req.roleBrief?.trim();
  return [
    levelGuidance(req.level),
    brief
      ? `Role context (tailor questions to this role; keep the same count):\n${brief.slice(0, 4000)}`
      : '',
    `Phase: ${req.ctx.phase}. Next action: ${req.effect.kind}.`,
    req.code ? `Candidate code so far:\n${req.code.slice(0, 1500)}` : '',
    recent ? `Recent transcript:\n${recent}` : '',
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

function parseDecision(raw: string): OracleDecision {
  const obj = JSON.parse(raw) as Partial<OracleDecision>;
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
