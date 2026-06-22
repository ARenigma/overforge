// Single, pinned Minimax client + a Minimax-backed Oracle.
//
// This is the ONLY LLM wrapper in the system (all multi-provider code was deleted).
// The HTTP call targets Minimax's chat-completions API; the exact base URL / model
// are pinned via env and verified against the live account when credentials are
// staged (see docs/ARCHITECTURE_SPEC §4). Until then this typechecks and is unit-
// tested via the DeterministicOracle; live calls require MINIMAX_API_KEY.

import { Oracle, UtteranceRequest, Utterance, EvaluateRequest } from './oracle';
import { OracleDecision } from './types';

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
    } catch {
      // Safe, bounded fallback: never loop on parse/transport failure.
      return { followUp: false, reason: 'evaluator unavailable; advancing', signal: 0 };
    }
  }
}

const INTERVIEWER_SYSTEM =
  'You are a concise, warm, professional technical interviewer. Speak in the first ' +
  'person, one short turn at a time. Never reveal scores or internal reasoning.';

const EVALUATOR_SYSTEM =
  'You judge a candidate answer for depth. Respond ONLY with strict JSON: ' +
  '{"followUp": boolean, "reason": string, "signal": number between 0 and 1}.';

function utteranceMode(kind: string): Utterance['expects'] {
  if (kind === 'ask_code' || kind === 'ask_followup') return 'code';
  if (kind === 'greet' || kind === 'ask_oral') return 'voice';
  return 'text';
}

// The full interview is short (~12 turns) and fits the model context comfortably, so the
// interviewer sees the whole conversation — earlier oral answers inform later questions.
const TRANSCRIPT_WINDOW = 40;

function buildUtterancePrompt(req: UtteranceRequest): string {
  const recent = req.transcript
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  return [
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

function parseDecision(raw: string): OracleDecision {
  const obj = JSON.parse(raw) as Partial<OracleDecision>;
  return {
    followUp: obj.followUp === true,
    reason: typeof obj.reason === 'string' ? obj.reason : '',
    signal: typeof obj.signal === 'number' ? Math.max(0, Math.min(1, obj.signal)) : 0,
  };
}
