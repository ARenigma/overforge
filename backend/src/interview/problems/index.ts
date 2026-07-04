// Curated coding-problem bank + deterministic selection. The bank data lives in bank.json
// (offline-verified: verify_bank.py runs each referencePython against every hidden test — all pass).
// No LLM at pick-time: problems are chosen by seniority level so every candidate on a given problem
// gets the identical, gradeable question. The LLM only WORDS probes/hints (never invents problems).
//
// NOTE: bank.json is copied into dist by the build script (tsc does not emit .json); see package.json.

import { CodingProblem } from '../types';
import bankData from './bank.json';

export const CODING_PROBLEMS: CodingProblem[] = bankData as unknown as CodingProblem[];

const BY_SLUG = new Map(CODING_PROBLEMS.map((p) => [p.slug, p]));

/** Look up a problem by slug (null if the slug is unknown — e.g. a bank entry was removed). */
export function getProblemBySlug(slug: string): CodingProblem | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * Pick `count` DISTINCT problems suited to `level`, randomized to limit leakage across candidates.
 * Falls back to the whole bank if the level-specific pool is too small. Pure selection (random
 * shuffle), no LLM — called once at interview creation and the chosen slugs are persisted.
 */
export function selectProblems(
  level: string | undefined,
  count: number,
  excludeSlugs: string[] = []
): CodingProblem[] {
  const lvl = (level ?? 'mid').toLowerCase();
  const notExcluded = (p: CodingProblem): boolean => !excludeSlugs.includes(p.slug);
  const pool = CODING_PROBLEMS.filter((p) => notExcluded(p) && p.levels.includes(lvl));
  const usable = pool.length >= count ? pool : CODING_PROBLEMS.filter(notExcluded);
  const shuffled = [...usable].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/** The candidate-safe view of a problem — everything EXCEPT hidden tests + reference solution. */
export interface PublicProblem {
  slug: string;
  title: string;
  difficulty: string;
  statement: string;
  examples: CodingProblem['examples'];
  constraints: string;
}

/** Strip a problem down to what the candidate may see (no hidden tests, no reference solution). */
export function toPublicProblem(p: CodingProblem): PublicProblem {
  return {
    slug: p.slug,
    title: p.title,
    difficulty: p.difficulty,
    statement: p.statement,
    examples: p.examples,
    constraints: p.constraints,
  };
}
