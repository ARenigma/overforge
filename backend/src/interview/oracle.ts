// The "oracle" is the bounded LLM seam. It does exactly two jobs and nothing
// else: produce the next interviewer utterance, and judge whether a coding
// answer warrants a follow-up. It NEVER selects the next state — the machine does.

import { InterviewContext, OracleDecision, Effect } from './types';

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
}

export interface UtteranceRequest {
  effect: Effect; // what the machine asked us to voice
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
  code?: string;
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

export interface Oracle {
  generateUtterance(req: UtteranceRequest): Promise<Utterance>;
  evaluateAnswer(req: EvaluateRequest): Promise<OracleDecision>;
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
        return { text: "Hi, I'm your interviewer today. Tell me a bit about yourself.", expects: 'voice' };
      case 'ask_oral':
        return { text: `Oral question ${e.index + 1}: walk me through a relevant project.`, expects: 'voice' };
      case 'handoff':
        return { text: "Great — let's move to the coding portion.", expects: 'text' };
      case 'ask_code':
        return { text: `Coding question ${e.index + 1}: implement the solution and explain it.`, expects: 'code' };
      case 'ask_followup':
        return { text: `Follow-up ${e.depth}: why this approach over the alternatives?`, expects: 'code' };
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
    return { followUp, reason: followUp ? 'answer was thin; probe deeper' : 'answer was substantive', signal };
  }
}
