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
}

export const RECOMMENDATIONS: readonly Recommendation[] = [
  'strong_hire',
  'hire',
  'lean_hire',
  'no_hire',
];
