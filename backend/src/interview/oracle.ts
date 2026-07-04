// The "oracle" is the bounded LLM seam. It does exactly two jobs and nothing
// else: produce the next interviewer utterance, and judge whether a coding
// answer warrants a follow-up. It NEVER selects the next state — the machine does.

import { InterviewContext, OracleDecision, Effect, InterventionKind } from './types';

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
  /** Set on interviewer turns produced by the autonomous intervention engine (USP) — lets the
   *  scorer discount a hinted solve and the room style hints distinctly from normal questions. */
  assist?: { kind: InterventionKind; strength: number };
}

export interface UtteranceRequest {
  effect: Effect; // what the machine asked us to voice
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
  code?: string;
  /** Interviewer-chosen seniority level — calibrates question difficulty/depth (not count). */
  level?: string;
  /** Free-text role/JD context — steers the topic/domain of questions (not count). */
  roleBrief?: string | null;
}

export interface Utterance {
  text: string;
  expects: 'voice' | 'text' | 'code';
}

export interface EvaluateRequest {
  answer: string;
  code?: string;
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
}

/** Request to word an autonomous intervention (USP). The policy has already decided IF and WHICH
 *  kind; the oracle only produces the short, balanced-senior-interviewer utterance. */
export interface InterventionRequest {
  kind: InterventionKind;
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
  code?: string;
  /** Recent run outcomes for the current question (oldest→newest) so a hint can reference them. */
  recentRuns?: { status: string; stderr?: string }[];
  level?: string;
  roleBrief?: string | null;
}

export interface Oracle {
  generateUtterance(req: UtteranceRequest): Promise<Utterance>;
  evaluateAnswer(req: EvaluateRequest): Promise<OracleDecision>;
  /** Produce the next interviewer intervention (counter-question / probe / hint / nudge). */
  generateIntervention(req: InterventionRequest): Promise<Utterance>;
}

/**
 * A deterministic, dependency-free oracle for offline dev and tests. It produces
 * canned utterances and a rule-based follow-up decision (short/low-signal answers
 * get a follow-up). The machine still enforces the hard follow-up cap.
 */
export class DeterministicOracle implements Oracle {
  async generateUtterance(req: UtteranceRequest): Promise<Utterance> {
    const e = req.effect;
    switch (e.kind) {
      case 'greet':
        return {
          text: "Hi — I'll be your technical interviewer today. We'll start with a walkthrough of one of your recent projects, then go deeper into a few technical areas. To start, tell me about the most technically challenging project you've worked on recently.",
          expects: 'voice',
        };
      case 'ask_oral':
        return {
          text:
            e.index === 0
              ? "Let's dig into that project — walk me through the hardest technical decision you made, and why you made it that way."
              : 'Now a more conceptual one: explain a core idea from that work from first principles, as if to a sharp peer.',
          expects: 'voice',
        };
      case 'ask_oral_followup':
        return {
          text: 'Let me push on that a bit — can you give me a concrete example or a specific trade-off you had to make?',
          expects: 'voice',
        };
      case 'handoff':
        return { text: "Great — let's move to the coding portion.", expects: 'text' };
      case 'ask_code':
        return {
          text: `Coding question ${e.index + 1}: implement the solution and explain it.`,
          expects: 'code',
        };
      case 'ask_followup':
        return {
          text: `Follow-up ${e.depth}: why this approach over the alternatives?`,
          expects: 'code',
        };
      case 'wrap_up':
        return { text: 'Thanks — that concludes the interview.', expects: 'text' };
      case 'score':
      case 'done':
        return { text: '', expects: 'text' };
    }
  }

  async evaluateAnswer(req: EvaluateRequest): Promise<OracleDecision> {
    const len = (req.answer ?? '').trim().length;
    // Deterministic rule: thin answers warrant a follow-up; substantial ones don't.
    const followUp = len > 0 && len < 120;
    const signal = Math.max(0, Math.min(1, len / 240));
    return {
      followUp,
      reason: followUp ? 'answer was thin; probe deeper' : 'answer was substantive',
      signal,
      ...(followUp ? { kind: 'probe' as const } : {}),
    };
  }

  async generateIntervention(req: InterventionRequest): Promise<Utterance> {
    const canned: Record<InterventionKind, string> = {
      counter_question: 'Before we move on — what makes you confident that approach is correct?',
      probe: "Walk me through what you expected to happen versus what you're seeing.",
      hint: 'Take another look at your edge cases — what happens at the boundaries of your input?',
      nudge: "Talk me through where you're at — what are you trying right now?",
    };
    return { text: canned[req.kind], expects: 'code' };
  }
}
