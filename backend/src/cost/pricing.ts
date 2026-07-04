// Cost rates (USD). These are ESTIMATES and env-overridable — the RAW usage stored in cost_events
// (tokens / chars / seconds / ms) is the authoritative source of truth; cost_usd is a best-effort
// derived figure so a wrong rate never corrupts the underlying data. Verify against live vendor
// pricing and override via env when confirmed.
//
// Override options:
//   LLM_PRICING_JSON = '{"model-id":{"inPerMTok":0.15,"outPerMTok":0.75}, ...}'  (merged over defaults)
//   TTS_USD_PER_MCHAR  (Cartesia; default below)
//   STT_USD_PER_HOUR   (AssemblyAI streaming; default below)
//   EXEC_USD_PER_HOUR  (self-hosted VPS container; default 0 — marginal cost ~0)

interface LlmRate {
  inPerMTok: number;
  outPerMTok: number;
}

const DEFAULT_LLM_RATES: Record<string, LlmRate> = {
  'openai/gpt-oss-120b': { inPerMTok: 0.15, outPerMTok: 0.75 },
  'openai/gpt-oss-20b': { inPerMTok: 0.1, outPerMTok: 0.5 },
  'qwen/qwen3-32b': { inPerMTok: 0.29, outPerMTok: 0.59 },
  'llama-3.3-70b-versatile': { inPerMTok: 0.59, outPerMTok: 0.79 },
};

// Fallback for an unlisted model (e.g. MiniMax variants) — conservative-ish.
const FALLBACK_LLM_RATE: LlmRate = { inPerMTok: 0.3, outPerMTok: 1.2 };

function llmRates(): Record<string, LlmRate> {
  const base = { ...DEFAULT_LLM_RATES };
  const override = process.env.LLM_PRICING_JSON;
  if (override) {
    try {
      Object.assign(base, JSON.parse(override) as Record<string, LlmRate>);
    } catch {
      // ignore a malformed override — keep defaults
    }
  }
  return base;
}

const num = (env: string | undefined, fallback: number): number => {
  const n = Number(env);
  return Number.isFinite(n) ? n : fallback;
};

/** USD for one LLM call given the model + token counts. */
export function llmCost(model: string, promptTokens: number, completionTokens: number): number {
  const rate = llmRates()[model] ?? FALLBACK_LLM_RATE;
  return (promptTokens / 1e6) * rate.inPerMTok + (completionTokens / 1e6) * rate.outPerMTok;
}

/** USD for synthesizing `chars` of TTS (Cartesia bills per character). */
export function ttsCost(chars: number): number {
  return (chars / 1e6) * num(process.env.TTS_USD_PER_MCHAR, 65); // ~$65/1M chars (Cartesia Sonic est.)
}

/** USD for `audioSeconds` of streaming STT (AssemblyAI bills per hour). */
export function sttCost(audioSeconds: number): number {
  return (audioSeconds / 3600) * num(process.env.STT_USD_PER_HOUR, 0.15); // ~$0.15/hr streaming (est.)
}

/** USD for `execMs` of sandbox container time (self-hosted → default 0). */
export function execCost(execMs: number): number {
  return (execMs / 3_600_000) * num(process.env.EXEC_USD_PER_HOUR, 0);
}
