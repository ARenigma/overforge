// Output of the deterministic scoring pass. Stored in interviews.evaluation_score
// and packaged into the interviewer scorecard email.

export type Recommendation = 'strong_hire' | 'hire' | 'lean_hire' | 'no_hire';

export interface ScoreDimension {
  name: string; // e.g. 'problem_solving', 'code_quality', 'communication', 'depth'
  score: number; // 0..5
  notes: string;
}

export interface Scorecard {
  overall: number; // 0..5
  recommendation: Recommendation;
  dimensions: ScoreDimension[];
  summary: string;
  /** True when automatic scoring failed — a human must review. Never a real no_hire. */
  scoringFailed?: boolean;
  /** True when the interview didn't complete (candidate no-show or dropout): scores reflect
   *  only a partial transcript (or none), so this is a status note, not a hire judgement. */
  incomplete?: boolean;
}

export const RECOMMENDATIONS: readonly Recommendation[] = [
  'strong_hire',
  'hire',
  'lean_hire',
  'no_hire',
];
