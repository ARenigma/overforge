// The "oracle" is the bounded LLM seam. It does exactly two jobs and nothing
// else: produce the next interviewer utterance, and judge whether a coding
// answer warrants a follow-up. It NEVER selects the next state — the machine does.

import { InterviewContext, OracleDecision, Effect, InterventionKind, ObserverNote } from './types';

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
  /** Set on interviewer turns produced by the autonomous intervention engine (USP) — lets the
   *  scorer discount a hinted solve and the room style hints distinctly from normal questions. */
  assist?: { kind: InterventionKind; strength: number; mandatory?: boolean };
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
  /** For `ask_code`: the assigned coding problem's full statement, presented VERBATIM (the oracle
   *  must not invent a problem). Absent for non-coding effects / legacy interviews without a bank. */
  problemStatement?: string | null;
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
/** Deterministic, CODE-ANCHORED counter-question for the mandatory-CQ fallback (B5). Extracts a
 *  salient construct from the submitted code and asks about it, so even with the LLM down the
 *  question cites something the candidate actually wrote — an overlay tool that only heard the
 *  problem statement cannot answer it. Wording is derived from the code (no RNG) for testability. */
function codeAnchoredProbe(code?: string): string {
  const src = (code ?? '').trim();
  if (!src) {
    return 'Before we move on — walk me through your overall approach and its time complexity, step by step.';
  }
  const fn = src.match(/\b(?:def|function|func|fn)\s+([A-Za-z_]\w*)/);
  const nestedLoop = /(for|while)[\s\S]*?\b(for|while)\b/.test(src);
  const usesDict = /(\{\s*\}|dict\(|defaultdict|new Map\b|HashMap|\{[^}\n]*:[^}\n]*\})/.test(src);
  const usesSet = /(\bset\(|new Set\b|HashSet)/.test(src);
  const usesSort = /(\.sort\(|\bsorted\(|Arrays\.sort)/.test(src);
  let anchor = 'your solution';
  if (nestedLoop) anchor = 'the nested loop in your solution';
  else if (usesDict) anchor = 'the hash map / dictionary you used';
  else if (usesSet) anchor = 'the set you used';
  else if (usesSort) anchor = 'the sort step in your solution';
  else if (fn) anchor = `your \`${fn[1]}\` function`;
  const templates = [
    `Looking at ${anchor} — what's its time and space complexity, and could you do better?`,
    `Walk me through ${anchor}: what happens on an empty input, or the largest input the constraints allow?`,
    `About ${anchor} — why did you choose it over the alternatives, and what's the trade-off?`,
  ];
  return templates[src.length % templates.length];
}

export interface InterventionRequest {
  kind: InterventionKind;
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
  code?: string;
  /** Recent run outcomes for the current question (oldest→newest) so a hint can reference them. */
  recentRuns?: { status: string; stderr?: string }[];
  level?: string;
  roleBrief?: string | null;
  /** The assigned coding problem's statement, so a hint is grounded in the actual task. */
  problemStatement?: string | null;
  /** Short factual note on the latest run's hidden-test outcome (e.g. "ran clean but failed 2/6
   *  hidden tests" vs "errored") so the hint targets the real failure — never the raw test I/O. */
  testSummary?: string | null;
  /** Escalation level (1 = gentle probe, 2 = deeper hint) — lets a deeper rung be worded more
   *  specifically than the probe. */
  strength?: number;
  /** How many consecutive failing runs the candidate is on — signals HOW stuck they are. */
  consecutiveFailures?: number;
  /** Set ONLY for a Path-B idle check-in (kind='nudge', no failing run observed): 'blank' = the
   *  editor is empty (invite them to talk through an approach or a small example by hand); 'partial'
   *  = they wrote some code and paused (invite a walk-through of their own code on a small input).
   *  The wording must stay CONTENT-FREE — never reference bugs, tests, or fixes, because nothing failed. */
  idleMode?: 'blank' | 'partial';
  /** Set for the mandatory counter-question fired on SUBMIT. The utterance MUST cite a concrete
   *  element of the submitted `code` (a data structure, loop, function, or algorithm choice) — a
   *  generic "explain your approach" is answerable by an overlay tool and defeats the anti-cheat
   *  moat. The deterministic fallback uses this to stay code-anchored even without the LLM (B5). */
  mandatory?: boolean;
  /** Expert-authored per-family grounding hints for the current problem (server-only), used to seed
   *  a code-anchored counter-question. */
  probeHints?: string[] | null;
  /** Recent observer notes (§6.4): injected into intervention wording to sharpen specificity.
   *  approach/transition always included; diagnosis only at ladderRung ≥ 2. */
  observerNotes?: ObserverNote[];
  /** Escalation rung within the intervention ladder — controls how much of the observer note
   *  is injected (diagnosis only at rung ≥ 2). */
  ladderRung?: number;
}

/** A candidate utterance whose intent (a clarifying QUESTION vs an ANSWER) is not yet known. */
export interface ClarifyRequest {
  /** The raw candidate text. */
  text: string;
  ctx: InterviewContext;
  transcript: TranscriptTurn[];
  /** The assigned coding problem's statement (coding phase) — grounds the clarifying reply. */
  problemStatement?: string | null;
  level?: string;
  roleBrief?: string | null;
}

/** Intent classification + (if a question) the grounded, non-spoiler reply — one bounded seam. */
export interface ClarifyResult {
  intent: 'answer' | 'question';
  /** Present only when intent === 'question': the interviewer's brief clarifying reply. */
  reply?: Utterance;
}

export interface Oracle {
  generateUtterance(req: UtteranceRequest): Promise<Utterance>;
  evaluateAnswer(req: EvaluateRequest): Promise<OracleDecision>;
  /** Produce the next interviewer intervention (counter-question / probe / hint / nudge). */
  generateIntervention(req: InterventionRequest): Promise<Utterance>;
  /** Decide whether a candidate utterance is a clarifying QUESTION (vs an answer) and, if so,
   *  produce a brief grounded reply that NEVER reveals the solution or hidden tests. Lets the
   *  interviewer answer questions humanely without advancing the FSM. */
  classifyAndAnswer(req: ClarifyRequest): Promise<ClarifyResult>;
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
          text: "Hi — I'll be your technical interviewer today. We'll start with a walk-through of a recent project of yours, then go deeper into a few technical areas. [pause] To start, tell me about the most technically challenging project you've built recently.",
          expects: 'voice',
        };
      case 'ask_oral':
        return {
          text:
            e.index === 0
              ? 'Okay so — walk me through the hardest technical decision you made on that project, and why you went that way.'
              : 'Now a more conceptual one: explain a core idea from that work from first principles, as if to a sharp peer.',
          expects: 'voice',
        };
      case 'ask_oral_followup':
        return {
          text: 'Right — let me push on that a bit. Can you give me a concrete example, or a specific trade-off you had to make?',
          expects: 'voice',
        };
      case 'handoff':
        return { text: "Okay — let's shift to some coding.", expects: 'text' };
      case 'ask_code':
        return {
          // The full problem is shown on the candidate's screen (problem panel); the interviewer
          // gives a brief spoken intro, never reads the whole statement aloud.
          text:
            e.index === 0
              ? "Let's move into the coding part. Your first problem is on the screen now — take a minute to read it, then walk me through your approach before you start coding."
              : "Here's your next problem, up on the screen. Have a read and tell me how you'd approach it.",
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
    // Idle check-in (Path B): word by stuck-mode, and stay content-free (nothing failed).
    if (req.kind === 'nudge' && req.idleMode) {
      const idle =
        req.idleMode === 'blank'
          ? "No rush at all — want to talk me through how you're thinking about this, or try a small example by hand?"
          : "Take your time — want to walk me through what you've got so far on a small input?";
      return { text: idle, expects: 'code' };
    }
    // B5: the mandatory counter-question must stay CODE-ANCHORED even without the LLM (429/timeout),
    // else it degrades to a generic "explain your approach" that an overlay tool can answer.
    if (req.mandatory) {
      return { text: codeAnchoredProbe(req.code), expects: 'code' };
    }
    const canned: Record<InterventionKind, string> = {
      counter_question: 'Before we move on — what makes you confident that approach is correct?',
      probe: "Hmm, walk me through what you expected to happen versus what you're actually seeing.",
      hint: 'Take another look at your edge cases — what happens at the boundaries of your input?',
      nudge: "Talk me through where you're at — what are you trying right now?",
      offer:
        "You've been at this a while — [pause] would you like a more concrete pointer, or would you rather keep going on your own?",
      encourage:
        "<soft>Nice — that's passing now.</soft> [pause] Walk me through what you changed to fix it.",
    };
    return { text: canned[req.kind], expects: 'code' };
  }

  async classifyAndAnswer(req: ClarifyRequest): Promise<ClarifyResult> {
    // Heuristic fallback (used only when the live oracle is unavailable): treat text that ends
    // with "?" or opens with a question word as a clarifying question. Reply is a safe, no-spoiler
    // redirect that keeps the candidate moving.
    const t = (req.text ?? '').trim();
    const isQuestion =
      /\?\s*$/.test(t) ||
      /^(who|what|when|where|why|how|can|could|should|is|are|do|does|did|will|would|may|might|which)\b/i.test(
        t
      );
    if (!isQuestion) return { intent: 'answer' };
    const expects = req.ctx.phase === 'coding' ? 'code' : 'voice';
    return {
      intent: 'question',
      reply: {
        text: "Go with a reasonable assumption and state it out loud — I'm more interested in your reasoning than in one exact reading of the prompt.",
        expects,
      },
    };
  }
}
