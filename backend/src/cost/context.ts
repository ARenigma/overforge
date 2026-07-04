// Ambient cost-attribution context. LLM calls happen deep inside the oracle/scorer, far from the
// interviewId — rather than thread it through every method signature, we carry {interviewId, kind,
// phase} in an AsyncLocalStorage set once at the call site (submitAnswer / begin / finishAndScore).
// The LLM client reads it when it records token usage, so every call is attributed automatically.
// Outside any context (e.g. unit tests), recording is simply skipped.

import { AsyncLocalStorage } from 'async_hooks';

export interface CostContext {
  interviewId: string;
  /** Which budget line this LLM call belongs to. */
  kind: 'brain' | 'scorer';
  phase?: string;
}

const storage = new AsyncLocalStorage<CostContext>();

export function withCostContext<T>(ctx: CostContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentCostContext(): CostContext | undefined {
  return storage.getStore();
}
