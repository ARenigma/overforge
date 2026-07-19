'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import dynamic from 'next/dynamic';
// Code-split the heavy CodeMirror editor out of the room's initial bundle: the chat shell
// paints immediately while the editor chunk streams in (it's client-only anyway).
const EnhancedCodeMirrorEditor = dynamic(
  () => import('@/components/enhanced-code-mirror-editor').then((m) => m.EnhancedCodeMirrorEditor),
  { ssr: false, loading: () => <div className="h-full w-full bg-background" /> }
);
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  beginInterview,
  answerInterview,
  runCode as apiRunCode,
  nudgeCandidate,
  speakChunk,
  speakStream,
  fetchCodingProblem,
  finishInterview,
  getInterviewState,
  type InterviewPhase,
  type RunResult,
  type PublicProblem,
} from '@/lib/api';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  CheckCircle,
  Clock,
  Loader2,
  Lock,
  Mic,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Wordmark } from '@/components/marketing/wordmark';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { ProblemDock } from '@/components/interview/problem-dock';
import { useVoiceMic } from '@/lib/voice/use-voice-mic';
import { useVoiceSocket } from '@/lib/voice/use-voice-socket';
import type { ServerReady, ServerTurnReady } from '@/lib/voice/types';
import { useCameraProctor } from '@/lib/proctor/use-camera-proctor';

const VOICE_WS_URL = process.env.NEXT_PUBLIC_VOICE_WS_URL ?? '';

// After the interviewer's audio ends, keep the mic gated this long so the speaker/room reverb tail
// can't echo back into the mic and commit as a phantom candidate turn (self-echo). Laptop-speaker
// room reverb runs ~500–800ms, so the earlier 500ms was too short.
const SPEAK_TAIL_COOLDOWN_MS = 800;
/** Suggested time per coding problem (soft — shown for pacing; the interview's overall cap is the
 *  only hard stop). ~15 min/problem × 2 + counter-questions keeps the session under an hour. */
const PROBLEM_SOFT_BUDGET_S = 15 * 60;
// One-time gate at session start: Chrome's AEC3 adaptive filter needs ~2–5s to converge before it
// actually cancels echo. Keep the mic gated this long after voice engages — the greeting plays
// during it, so AEC trains on the real speaker+mic path before the first candidate turn is captured.
const AEC_WARMUP_MS = 3000;

// ── Path B: stuck-not-running idle detector ──────────────────────────────────────────────────
// During coding a candidate can be stuck WITHOUT a failing run — frozen on a blank editor, or
// paused mid-code. We watch for COMPOUND idle (no keystroke AND no run AND no chat AND not
// speaking) and ask the server (feature-flagged + capped per question there) whether a gentle
// check-in is warranted. Thinking is never punished: any keystroke/run/message resets the clock and
// the windows are deliberately conservative — we'd rather miss a stall than misfire on someone who
// is thinking. Telemetry-tuned. Dev interviews (2-min cap) use compressed windows so the behavior
// is exercisable in E2E; real interviews always get the protective production windows.
const IDLE_POLL_MS = 5_000; // how often the idle condition is evaluated
const IDLE_WINDOW_MS = 90_000; // no keystroke/run/chat for this long ⇒ the candidate has stalled
const IDLE_BLANK_MIN_PROBLEM_MS = 150_000; // on a BLANK editor, protect this much planning time first
const IDLE_BLANK_MAX_CHARS = 10; // editor length below this counts as "blank / still planning"
const DEV_IDLE_WINDOW_MS = 20_000; // dev-interview equivalents (server-authoritative devMode only)
const DEV_IDLE_BLANK_MIN_PROBLEM_MS = 30_000;

// ── Streaming TTS (P1-B) ──────────────────────────────────────────────────────
// The interviewer's utterance is streamed as raw PCM16 from /speak-stream and scheduled onto a
// shared AudioContext as chunks arrive, so the first audio lands at ~TTFB instead of after
// full-sentence synthesis. Default ON; set NEXT_PUBLIC_TTS_STREAM=0 to force the legacy chunked
// /speak path. Any streaming failure before audio starts falls back to that path automatically.
const TTS_STREAMING = process.env.NEXT_PUBLIC_TTS_STREAM !== '0';
// Generous hard cap on ONE streamed utterance (fetch + playback tail). Exists so the half-duplex
// mic gate can never stay stuck behind a wedged stream; normal turns finish far inside it.
const TTS_STREAM_WATCHDOG_MS = 60_000;

/** Convert little-endian PCM16 bytes → Float32 samples for Web Audio. `byteLen` must be even. */
function pcm16ToFloat32(bytes: Uint8Array, byteLen: number): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, byteLen);
  const out = new Float32Array(byteLen >> 1);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** Read a raw-PCM16 streaming response body and play it gaplessly on `ctx`: each chunk becomes an
 *  AudioBuffer scheduled at a monotonic playback head (playT = max(playT, now); start(playT);
 *  playT += duration). Chunk boundaries can split a 16-bit sample, so a 1-byte remainder is
 *  carried between chunks. Resolves when the stream has ended AND the last scheduled buffer has
 *  finished (or on cancel/watchdog — the mic gate can never stay stuck here). Returns true if ANY
 *  audio was scheduled: a mid-stream failure after audio has played must NOT trigger the chunked
 *  fallback, which would replay the utterance from the top. */
async function playPcmStream(opts: {
  body: NonNullable<Response['body']>;
  ctx: AudioContext;
  sampleRate: number;
  isCancelled: () => boolean;
  registerStop: (stop: () => void) => void;
  /** Fires ONCE, when the first chunk is scheduled to play — the felt "interviewer starts
   *  talking" moment (first_audio_ms telemetry). */
  onFirstAudio?: () => void;
}): Promise<boolean> {
  const { body, ctx, sampleRate, isCancelled, registerStop, onFirstAudio } = opts;
  const reader = body.getReader();
  const sources: AudioBufferSourceNode[] = [];
  let playT = 0;
  let scheduledAny = false;
  let stopped = false;
  let wakeTail: (() => void) | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    void reader.cancel().catch(() => undefined);
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // source already ended — fine
      }
    }
    sources.length = 0;
    wakeTail?.(); // release a pending tail wait immediately
  };
  registerStop(stop);
  const watchdog = setTimeout(stop, TTS_STREAM_WATCHDOG_MS);

  // Wait out whatever is still scheduled on the playback head (cancel-aware via wakeTail).
  const waitTail = async () => {
    const remainingMs = Math.max(0, (playT - ctx.currentTime) * 1000);
    if (!scheduledAny || remainingMs <= 0 || stopped) return;
    await new Promise<void>((resolve) => {
      wakeTail = resolve;
      setTimeout(resolve, remainingMs + 50);
    });
  };

  let carry: Uint8Array | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (stopped) return scheduledAny;
      if (isCancelled()) {
        stop(); // superseded (e.g. the filler bumped the seq) — silence our scheduled audio too
        return scheduledAny;
      }
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      // PCM16 alignment: prepend last chunk's odd trailing byte, carry this chunk's (if any).
      let bytes: Uint8Array = value;
      if (carry) {
        const merged = new Uint8Array(carry.length + value.length);
        merged.set(carry, 0);
        merged.set(value, carry.length);
        bytes = merged;
      }
      const even = bytes.length & ~1;
      carry = even < bytes.length ? bytes.slice(even) : null;
      if (even === 0) continue;

      const f32 = pcm16ToFloat32(bytes, even);
      const buf = ctx.createBuffer(1, f32.length, sampleRate);
      buf.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      // Monotonic playback head: butt each chunk against the previous one; never schedule in
      // the past (first chunk, or if decode ever lagged behind playback).
      playT = Math.max(playT, ctx.currentTime);
      src.start(playT);
      playT += buf.duration;
      sources.push(src);
      if (!scheduledAny) onFirstAudio?.();
      scheduledAny = true;
    }
    await waitTail();
    return scheduledAny;
  } catch {
    // Mid-stream network/decode error. If audio already played, let the scheduled tail finish and
    // report success (a fallback would replay from the top); if nothing played, signal fallback.
    if (!scheduledAny) {
      stop();
      return false;
    }
    await waitTail();
    return true;
  } finally {
    clearTimeout(watchdog);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'loading_token' | 'consent' | 'interview' | 'done' | 'error';

/** Sub-state within the consent stage: tracks camera permission flow. */
type ConsentCameraState = 'idle' | 'requesting' | 'denied';

interface Message {
  role: 'ai' | 'candidate';
  text: string;
  /** Set when this interviewer turn was an autonomous intervention (hint/probe/counter-question)
   *  — rendered with a distinct ember accent so it reads as the interviewer stepping in. */
  assist?: string;
}

/** Short label for an autonomous intervention, shown above the bubble. */
function assistLabel(kind: string): string {
  switch (kind) {
    case 'hint':
      return 'Hint';
    case 'probe':
      return 'Probe';
    case 'counter_question':
      return 'Follow-up';
    case 'nudge':
      return 'Check-in';
    default:
      return 'Interviewer';
  }
}

// Must stay in sync with backend SUPPORTED_LANGUAGES and the new-interview dialog's options —
// a value the interviewer can assign but that's missing here would fail isLanguage() and
// silently skip the room lock.
/** Editor-rail filename extension per language (cosmetic — the top rail's tab label). */
const LANG_EXT: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  cpp: 'cpp',
  go: 'go',
  ruby: 'rb',
};

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
] as const;

type Language = (typeof LANGUAGES)[number]['value'];

const PHASE_ORDER: InterviewPhase[] = ['greeting', 'oral', 'handoff', 'coding', 'wrap_up', 'done'];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Seconds elapsed since the server-recorded interview start, clamped to ≥ 0.
 *  Lets the timer resume at the correct value after a reload instead of restarting at 0. */
function elapsedSince(startedAt: string | null | undefined): number {
  if (!startedAt) return 0;
  const ms = Date.now() - new Date(startedAt).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

const DEFAULT_LANGUAGE: Language = 'python';

/** Validate a stored/loaded language string against the supported set. */
function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && LANGUAGES.some((l) => l.value === v);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card border border-destructive/40 rounded-xl p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="text-base font-medium text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

/** Passive device-status indicator (icon + dot) — mic/camera are REQUIRED for a proctored
 *  interview, so these are read-only: they show the device is live, with no way to disable it.
 *  `live` adds a ping pulse (e.g. the mic while actively listening). */
function DeviceIndicator({
  icon: Icon,
  on,
  live = false,
  title,
}: {
  icon: LucideIcon;
  on: boolean;
  live?: boolean;
  title: string;
}) {
  return (
    <span title={title} className="flex items-center gap-1 px-1 text-foreground-subtle">
      <Icon
        className={`h-3.5 w-3.5 ${on ? 'text-foreground' : 'text-foreground-subtle'}`}
        aria-hidden="true"
      />
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        {live && on && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
            on ? 'bg-success' : 'bg-foreground-subtle/40'
          }`}
        />
      </span>
      <span className="sr-only">{title}</span>
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const id = params.id;
  const urlToken = searchParams.get('t');
  const sessionKey = `of_session_${id}`;
  const langKey = `of_lang_${id}`;

  const [stage, setStage] = useState<Stage>('loading_token');
  const [errorMsg, setErrorMsg] = useState<string>('');
  /** Camera permission sub-state tracked during the consent stage. */
  const [consentCameraState, setConsentCameraState] = useState<ConsentCameraState>('idle');
  // Rotated session token used for all candidate calls after begin.
  const [activeToken, setActiveToken] = useState<string | null>(null);
  // When set, this session is being RESUMED (reload / new tab). Consent (camera + mic) must be
  // re-granted before re-entering the room — reloading must NOT bypass proctoring. handleBegin then
  // rehydrates via resumeSession() instead of beginInterview().
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  // Inline answer error (kept out of the transcript) so the candidate can resend.
  const [answerError, setAnswerError] = useState<string | null>(null);

  // Interview state
  const [phase, setPhase] = useState<InterviewPhase>('greeting');
  // The current coding problem (statement/examples/constraints — never hidden tests), shown in the
  // room's problem panel during the coding phase. Fetched server-side; re-fetched as the question
  // advances (codeIndex) so the panel always shows the problem in play.
  const [codingProblem, setCodingProblem] = useState<PublicProblem | null>(null);
  const [problemOpen, setProblemOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  // Code pane — language persists across reloads via localStorage (per-interview key).
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    const stored = localStorage.getItem(langKey);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  // Interviewer-assigned language (set at creation). When non-null the editor is locked to it
  // and the in-room language switcher is hidden; null = the candidate picks (localStorage path).
  const [lockedLanguage, setLockedLanguage] = useState<Language | null>(null);
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  // Distinct from aiThinking: a SUBMIT / MOVE-ON is in flight (disables the coding controls without
  // freezing the whole room). Move-on confirmation dialog visibility.
  const [submitting, setSubmitting] = useState(false);
  const [moveOnOpen, setMoveOnOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // Voice (P1): the interviewer speaks its turns (always audible — the candidate can't mute it).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakSeqRef = useRef(0); // bumped to cancel in-flight playback on a new turn
  // Streaming TTS (P1-B): shared lazy AudioContext for PCM playback + canceller for the in-flight
  // streamed utterance (aborts its fetch AND stops its scheduled Web Audio sources).
  const ttsCtxRef = useRef<AudioContext | null>(null);
  const stopTtsStreamRef = useRef<(() => void) | null>(null);

  // Answer textarea
  const [answer, setAnswer] = useState('');

  // Responsive: stack the split-pane vertically on small screens
  const [isMobile, setIsMobile] = useState(false);

  // Elapsed session timer (count-up) + live editor cursor position
  const [elapsed, setElapsed] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  // Hard time limit: total interview length (seconds, from the server) and whether we ended
  // because it ran out. The room counts up and hard-stops at this.
  const [durationSec, setDurationSec] = useState(0);
  const [concludedByTime, setConcludedByTime] = useState(false);
  // Dev/testing interview → paste allowed. Real interviews block paste (integrity).
  const [devMode, setDevMode] = useState(false);
  // Transient "Pasting is disabled" hint, shown briefly when a paste is blocked.
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const pasteHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Voice (P2-B.4b) ──────────────────────────────────────────────────────────
  // voiceMode: true = browser is in spoken-interview mode (WS + mic active).
  // Automatically entered when NEXT_PUBLIC_VOICE_WS_URL is set and the mic is granted.
  const [voiceMode, setVoiceMode] = useState(false);
  // Whether the mic should forward frames (suppressed during TTS playback).
  const [micForwarding, setMicForwarding] = useState(false);
  // The most-recent `expects` value received from the server — gates mic vs typing.
  const lastExpectsRef = useRef<'voice' | 'text' | 'code'>('voice');
  // True while TTS is playing a voice-mode turn (suppresses mic frames).
  const voiceSpeakingRef = useRef(false);
  // Timestamp (ms) until which mic frames stay gated AFTER interviewer audio ends — lets the
  // speaker/room tail clear so the mic doesn't capture the reverb as a phantom turn (self-echo).
  const micCooldownUntilRef = useRef(0);
  // The requestId of the turn we are currently playing/acking.
  const pendingVoiceRequestRef = useRef<string | null>(null);
  // Whether the voice WS should be connected (set false on fatal / voice toggle).
  const [voiceSocketEnabled, setVoiceSocketEnabled] = useState(false);

  // One guard for /finish across BOTH conclude paths (timer hard-stop and phase→done), so they
  // can't each fire a redundant /finish if they trip at the same moment.
  const concludeCalledRef = useRef(false);

  // Idempotency: requestId of the last answer attempt, reused on retry so the server dedupes.
  const pendingAnswerRef = useRef<{ text: string; requestId: string } | null>(null);

  // Transcript scroll ref
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Chat panel collapse — Supabase-style SLIDE. react-resizable-panels' collapse sets flex→0, which
  // squishes the content; to slide instead, we freeze the content at its current pixel width and
  // absolutely position it (left-anchored) inside an overflow-hidden panel. As the panel's flex
  // animates to 0 the fixed-width block tracks the receding edge and glides out (clipped) while the
  // editor grows to fill. The flex transition is gated to button-driven collapse/expand so a manual
  // handle-drag never smears.
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const chatInnerRef = useRef<HTMLDivElement>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatAnimating, setChatAnimating] = useState(false);
  // Frozen content width (px) during the slide; null = fluid (fills the panel, resizable).
  const [chatSlideW, setChatSlideW] = useState<number | null>(null);
  const chatAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animateChatPanel = useCallback((action: 'collapse' | 'expand') => {
    const p = chatPanelRef.current;
    if (!p) return;
    if (chatAnimTimer.current) clearTimeout(chatAnimTimer.current);
    setChatAnimating(true);
    if (action === 'collapse') {
      setChatSlideW(chatInnerRef.current?.offsetWidth ?? null);
      p.collapse();
    } else {
      p.expand();
    }
    chatAnimTimer.current = setTimeout(() => setChatAnimating(false), 300);
  }, []);
  // Once expanded and settled, release the frozen width so the panel is fluid/resizable again.
  useEffect(() => {
    if (!chatCollapsed && !chatAnimating) setChatSlideW(null);
  }, [chatCollapsed, chatAnimating]);
  const chatAnimClass = chatAnimating ? '[transition:flex_260ms_ease-in-out]' : '';
  // Live mirror for callbacks that must read the collapse state without re-binding (refetchProblem).
  const chatCollapsedRef = useRef(false);
  useEffect(() => {
    chatCollapsedRef.current = chatCollapsed;
  }, [chatCollapsed]);

  // ── Proctor hook ──────────────────────────────────────────────────────────────
  // Camera proctoring: face detection runs entirely in-browser via a Web Worker.
  // No video frames are ever transmitted — only numeric aggregates every ~15s.
  const {
    cameraState,
    start: startCamera,
    stop: stopCamera,
  } = useCameraProctor({ interviewId: id, token: activeToken });

  // Stop proctoring when the interview ends.
  useEffect(() => {
    if (stage === 'done') stopCamera();
  }, [stage, stopCamera]);

  // ── Voice hooks ───────────────────────────────────────────────────────────────
  // sendFrameRef breaks the forward-reference cycle: the mic hook captures the ref,
  // the socket hook populates it once instantiated below.
  const sendFrameRef = useRef<((buf: ArrayBuffer) => void) | null>(null);
  // Live mirror of micForwarding. The mic worklet binds onFrame ONCE at start() (when micForwarding
  // is still false), so the callback must read forwarding state from a ref — reading the captured
  // state value froze it at false and dropped every frame forever even after voice was armed.
  const micForwardingRef = useRef(false);

  const {
    micState,
    start: startMic,
    stop: stopMic,
  } = useVoiceMic({
    // Stable callback (deps []): the worklet captures it once. Gate via the live ref, not state.
    onFrame: useCallback((buf: ArrayBuffer) => {
      // Half-duplex: also drop frames while the interviewer is speaking, else the mic captures our
      // own greeting/reply as a phantom candidate turn (self-echo → false-fire → "stuck speaking").
      if (
        !micForwardingRef.current ||
        voiceSpeakingRef.current ||
        Date.now() < micCooldownUntilRef.current
      )
        return;
      sendFrameRef.current?.(buf);
    }, []),
  });

  // Keep the forwarding ref current for the worklet's captured onFrame closure.
  useEffect(() => {
    micForwardingRef.current = micForwarding;
  }, [micForwarding]);

  // speak() is defined below but the socket cue handlers need it — use a ref.
  const speakRef = useRef<
    | ((source: 'turn' | 'run', tokenOverride?: string, textOverride?: string) => Promise<void>)
    | null
  >(null);
  const activeTokenRef = useRef<string | null>(null);
  useEffect(() => {
    activeTokenRef.current = activeToken;
  }, [activeToken]);

  // Fetch the current coding problem in the coding phase; re-checked on each turn so the panel
  // follows codeIndex across coding questions. Deduped by codeIndex so an unchanged problem never
  // triggers a re-render (avoids churn from the per-message re-check). Cleared outside coding.
  const problemCodeIndexRef = useRef(-1);
  const problemStartElapsedRef = useRef(0); // `elapsed` (s) when the current problem began
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // ── Path B idle detector — live refs (setInterval captures once; read live values, never stale). ──
  // Init timestamps to mount time so a fresh load / resume never fires a spurious nudge at t=0.
  const lastKeystrokeRef = useRef<number>(Date.now());
  const lastRunAtRef = useRef<number>(Date.now());
  const nudgeInFlightRef = useRef(false);
  // After ANY /nudge response (check-in delivered, or a server "stay quiet"), don't ask again for a
  // while — a still-idle candidate must not generate a poll-rate stream of nudge POSTs.
  const nudgeCooldownUntilRef = useRef(0);
  const phaseRef = useRef(phase);
  const runningRef = useRef(running);
  const codeRef = useRef(code);
  const devModeRef = useRef(devMode);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useEffect(() => {
    devModeRef.current = devMode;
  }, [devMode]);
  // Conversation is activity too: a candidate asking a clarifying question (or reading the
  // interviewer's reply) is engaged, not stalled — any new message resets the idle clock so the
  // detector can never nudge into the middle of an exchange.
  useEffect(() => {
    if (messages.length > 0) lastKeystrokeRef.current = Date.now();
  }, [messages.length]);
  const refetchProblem = useCallback(async () => {
    const tok = activeTokenRef.current;
    if (!tok) return;
    const res = await fetchCodingProblem(id, tok);
    if (res && res.codeIndex !== problemCodeIndexRef.current) {
      problemCodeIndexRef.current = res.codeIndex;
      problemStartElapsedRef.current = elapsedRef.current; // reset the per-problem soft clock
      setCodingProblem(res.problem);
      // The question just landed in the dock — auto-collapse the chat so problem + editor get the
      // full width. Anything conversational slides it back (see the expand effects below), and the
      // top-bar button stays live for manual reopen.
      if (!chatCollapsedRef.current) animateChatPanel('collapse');
    }
  }, [id, animateChatPanel]);
  useEffect(() => {
    if (phase === 'coding') {
      void refetchProblem();
    } else {
      problemCodeIndexRef.current = -1;
      setCodingProblem(null);
    }
  }, [phase, messages.length, refetchProblem]);

  // Per-problem soft pacing nudge: one non-blocking toast when this problem crosses the ~15-min
  // budget. It NEVER auto-submits or advances — only the overall cap is hard. Fires once per
  // problem (keyed on codeIndex), and only in coding.
  const nudgedProblemRef = useRef(-1);
  useEffect(() => {
    if (phase !== 'coding') return;
    const overBudget = elapsed - problemStartElapsedRef.current > PROBLEM_SOFT_BUDGET_S;
    if (overBudget && nudgedProblemRef.current !== problemCodeIndexRef.current) {
      nudgedProblemRef.current = problemCodeIndexRef.current;
      toast('Heads-up on time', {
        description:
          "You've spent about 15 minutes on this problem — no hard stop, but wrap up when ready, or use Submit / Move on.",
      });
    }
  }, [elapsed, phase]);

  // Slide the auto-collapsed chat back open the moment the interviewer says anything mid-coding —
  // the composer lives in the chat panel, so a probe/hint the candidate must read (and answer)
  // can never land behind a collapsed panel. Guarded on a NEW message so a manual re-collapse
  // with a stale transcript isn't fought.
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (messages.length <= prev) return;
    const last = messages[messages.length - 1];
    if (phase === 'coding' && chatCollapsed && last?.role === 'ai') animateChatPanel('expand');
  }, [messages, phase, chatCollapsed, animateChatPanel]);
  // Coding is over — the conversation takes the stage again.
  useEffect(() => {
    if ((phase === 'wrap_up' || phase === 'done') && chatCollapsed) animateChatPanel('expand');
  }, [phase, chatCollapsed, animateChatPanel]);

  const handleVoiceReady = useCallback((cue: ServerReady) => {
    lastExpectsRef.current = cue.expects;
    // Arm mic forwarding if the server expects voice immediately.
    if (cue.expects === 'voice') setMicForwarding(true);
  }, []);

  const handleVoiceThinking = useCallback(() => {
    // Turn committed — stop forwarding mic frames until the interviewer's reply plays. NO filler:
    // with instant EOT STT + streamed TTS the gap is ~1s, and a spoken filler bled into the mic
    // (self-echo → phantom AAI turn → erratic firing + spoken-ack desync = "stuck at speaking").
    setMicForwarding(false);
  }, []);

  // performance.now() of the moment the CURRENT utterance's first audio actually played — set by
  // speak() (streaming: first scheduled chunk; chunked: first clip's 'playing' event). Read after
  // playback to compute first_audio_ms (felt TTFB) for the spoken ack. A ref, not state: the
  // measurement must never be lost to a re-render (worklet stale-closure bug class).
  const firstAudioAtRef = useRef<number | null>(null);

  const handleVoiceTurnReady = useCallback(
    (cue: ServerTurnReady) => {
      // Clock starts when the cue lands — the same boundary the voice service's tts_ms starts at,
      // so browser first_audio_ms ⊂ server tts_ms by construction.
      const t0 = performance.now();
      lastExpectsRef.current = cue.utterance.expects;
      pendingVoiceRequestRef.current = cue.requestId;

      // Append candidate transcript bubble + interviewer utterance bubble.
      setMessages((prev) => [
        ...prev,
        { role: 'candidate' as const, text: cue.transcript },
        { role: 'ai' as const, text: cue.utterance.text },
      ]);
      // Adopt ONLY real FSM phases. The voice service also emits synthetic phases (the oral idle
      // probe's 'idle_probe') — blindly adopting one clobbered the room phase: a straggler probe
      // cue landing around the coding handoff unmounted the problem panel until the next real turn
      // (caught by the behavior-matrix E2E). The utterance still plays either way.
      if (PHASE_ORDER.includes(cue.phase as InterviewPhase)) {
        setPhase(cue.phase as InterviewPhase);
        if (cue.phase === 'done') setStage('done');
      }

      // Stop mic capture and play the interviewer's TTS via the existing speak() path.
      setMicForwarding(false);
      voiceSpeakingRef.current = true;

      const doSpeak = async () => {
        try {
          // Voice the EXACT utterance from this cue (not a server re-fetch). The idle probe's text
          // lives only in the voice service and is never persisted, so re-deriving it server-side
          // replayed the last real turn; passing the cue text makes audio always match what's shown.
          await speakRef.current?.('turn', undefined, cue.utterance.text);
        } catch (err) {
          // speak() now always resolves (it has its own playback timeout), but guard anyway so the
          // finally — which re-arms the mic — can NEVER be skipped by an unexpected throw.
          console.error('[voice] interviewer playback failed', err);
        } finally {
          voiceSpeakingRef.current = false;
          // Ack playback so the server arms the next turn — carrying the measured TTFB (null when
          // no audio played, or when the ref still holds a PREVIOUS turn's stamp: firstAt < t0).
          const firstAt = firstAudioAtRef.current;
          sendSpokenRef.current?.(
            cue.requestId,
            firstAt != null && firstAt >= t0 ? Math.round(firstAt - t0) : null
          );
          // Re-arm mic if next phase is still voice.
          if (cue.utterance.expects === 'voice' && !cue.isTerminal) {
            setMicForwarding(true);
          } else if (cue.utterance.expects !== 'voice') {
            // Coding/text phase — disarm mic and notify server.
            stopMic();
            sendMicOffRef.current?.();
          }
        }
      };
      void doSpeak();
    },
    [stopMic]
  );

  const handleVoiceFatal = useCallback(() => {
    setVoiceMode(false);
    setVoiceSocketEnabled(false);
    stopMic();
  }, [stopMic]);

  // These are populated once the socket hook is instantiated below.
  const sendSpokenRef = useRef<((requestId: string, firstAudioMs?: number | null) => void) | null>(
    null
  );
  const sendMicOffRef = useRef<(() => void) | null>(null);

  const { socketStatus, sendFrame, sendSpoken, sendMicOff } = useVoiceSocket({
    interviewId: id,
    token: activeToken,
    enabled: voiceSocketEnabled && !!VOICE_WS_URL,
    onReady: handleVoiceReady,
    onThinking: handleVoiceThinking,
    onTurnReady: handleVoiceTurnReady,
    onError: useCallback(() => {
      /* surfaced via fatal/disconnect */
    }, []),
    onClosing: useCallback(() => {
      setMicForwarding(false);
      stopMic();
    }, [stopMic]),
    onFatal: handleVoiceFatal,
  });

  // Wire the ref so the mic onFrame callback can call sendFrame.
  useEffect(() => {
    sendFrameRef.current = sendFrame;
  }, [sendFrame]);
  useEffect(() => {
    sendSpokenRef.current = sendSpoken;
  }, [sendSpoken]);
  useEffect(() => {
    sendMicOffRef.current = sendMicOff;
  }, [sendMicOff]);

  // When micState goes denied/error while voiceMode is requested, fall back to typed.
  useEffect(() => {
    if (micState === 'denied' || micState === 'error') {
      setVoiceMode(false);
      setVoiceSocketEnabled(false);
    }
  }, [micState]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiThinking]);

  // Track viewport so the split-pane can stack vertically on phones
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Count-up session timer — runs once the interview is underway
  useEffect(() => {
    if (stage !== 'interview') return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  // Hard time limit: when the countdown hits 0, conclude the interview — freeze the room (switch
  // to the done state) and fire scoring via /finish. The server also enforces this (rejects late
  // answers/runs) and concludes an absent candidate via the sweep; this is the in-room stop.
  useEffect(() => {
    if (stage !== 'interview' || durationSec <= 0 || concludeCalledRef.current) return;
    if (elapsed >= durationSec) {
      setConcludedByTime(true);
      setStage('done');
      if (activeToken) {
        concludeCalledRef.current = true;
        finishInterview(id, activeToken).catch(() => undefined);
      }
    }
  }, [elapsed, durationSec, stage, activeToken, id]);

  // Auto-call /finish when phase reaches done
  useEffect(() => {
    if (phase === 'done' && !concludeCalledRef.current && activeToken) {
      concludeCalledRef.current = true;
      finishInterview(id, activeToken).catch(() => {
        // Idempotent — ignore errors silently
      });
    }
  }, [phase, id, activeToken]);

  // Decide the entry stage: a saved session (reload / new tab) must RE-CONSENT before re-entering the
  // room (reloading must not bypass proctoring), so it shows the consent screen too — not an
  // auto-resume. A fresh link shows consent; anything else is an error.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(sessionKey) : null;
    if (saved) {
      setResumeToken(saved);
      setActiveToken(saved);
      setStage('consent');
    } else if (urlToken) {
      setStage('consent');
    } else {
      setErrorMsg('Invalid or missing interview link.');
      setStage('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Rehydrate an in-progress session and enter the room. Called from handleBegin AFTER camera/mic
  // consent is (re)granted — never before, so a reload can't skip proctoring.
  const resumeSession = useCallback(
    async (tok: string, micGranted: boolean) => {
      try {
        const s = await getInterviewState(id, tok);
        const done = s.status === 'scored' || s.phase === 'done' || s.phase === 'scoring';
        setPhase(done ? 'done' : (s.phase as InterviewPhase));
        const resumed: Message[] = s.transcript
          .filter((t) => t.role !== 'system')
          .map((t) => ({
            role: t.role === 'candidate' ? 'candidate' : 'ai',
            text: t.text,
            ...(t.assist ? { assist: t.assist.kind } : {}),
          }));
        // Run-triggered hints live on the code run (not the transcript) — surface the most recent
        // one on resume so it isn't lost across a reload.
        if (s.lastRunResult?.intervention?.text) {
          resumed.push({
            role: 'ai',
            text: s.lastRunResult.intervention.text,
            assist: s.lastRunResult.intervention.kind,
          });
        }
        setMessages(resumed);
        if (s.codeSnapshot) setCode(s.codeSnapshot);
        // Re-seed the elapsed timer from the server start so it doesn't restart at 0.
        setElapsed(elapsedSince(s.startedAt));
        setDurationSec(s.durationSeconds);
        setDevMode(s.devMode);
        // Restore the last run's output so the console isn't blank after a reload.
        if (s.lastRunResult) setRunResult(s.lastRunResult);
        // Language: an interviewer-assigned language locks the room and wins over everything;
        // otherwise the candidate's own (localStorage) choice wins, falling back to the
        // server's last-used language only when this browser has no stored preference.
        if (isLanguage(s.assignedLanguage)) {
          setLockedLanguage(s.assignedLanguage);
          setLanguage(s.assignedLanguage);
        } else if (isLanguage(s.language) && !localStorage.getItem(langKey)) {
          setLanguage(s.language);
        }
        setStage(done ? 'done' : 'interview');
        // Re-arm voice on resume if the mic was granted and voice is configured (mirrors begin).
        if (VOICE_WS_URL && !done && micGranted) {
          setVoiceMode(true);
          setVoiceSocketEnabled(true);
          micCooldownUntilRef.current = Date.now() + AEC_WARMUP_MS;
        }
      } catch {
        setErrorMsg(
          'Your interview session could not be resumed on this device. If you have not finished, please contact your interviewer.'
        );
        setStage('error');
      }
    },
    [id, langKey]
  );

  async function handleBegin() {
    // Camera AND microphone are REQUIRED for proctored interviews — for a FRESH start AND on RESUME
    // (reloading must NOT bypass proctoring). ONE click requests BOTH on the same user gesture:
    // startCamera() + startMic() are INVOKED synchronously inside Promise.allSettled so each
    // getUserMedia() fires within the activation window. We proceed only if the camera is granted; a
    // denied mic falls back to typed silently. The "retry" button on the denied screen calls this too.
    let micGranted = micState === 'granted';
    if (cameraState !== 'granted' || (!!VOICE_WS_URL && micState !== 'granted')) {
      setConsentCameraState('requesting');
      // Gate on the RETURNED states, not cameraState/micState — React state is stale here.
      const [camResult, micResult] = await Promise.allSettled([
        startCamera(),
        // Only prompt for the mic when voice is actually configured.
        VOICE_WS_URL ? startMic() : Promise.resolve('idle' as const),
      ]);
      setConsentCameraState('idle');
      const camFinal = camResult.status === 'fulfilled' ? camResult.value : 'error';
      micGranted = micResult.status === 'fulfilled' && micResult.value === 'granted';
      if (camFinal !== 'granted') {
        // Camera denied/errored — stay on the consent screen; the denied banner shows. The interview
        // cannot proceed (fresh OR resumed) without camera consent.
        return;
      }
    }

    // RESUME path: devices re-granted → rehydrate the in-progress session and re-enter the room.
    if (resumeToken) {
      setStage('loading_token');
      await resumeSession(resumeToken, micGranted);
      return;
    }

    if (!urlToken) return;
    setStage('loading_token');
    try {
      const res = await beginInterview(id, urlToken);
      // Persist the rotated session token (localStorage = survives reloads AND new tabs).
      localStorage.setItem(sessionKey, res.sessionToken);
      setActiveToken(res.sessionToken);
      setPhase(res.phase);
      setMessages([{ role: 'ai', text: res.utterance.text }]);
      void speak('turn', res.sessionToken); // the interviewer greets out loud (P1)
      // Anchor the timer to the server start (≈0 on a fresh begin, exact after any reload).
      setElapsed(elapsedSince(res.startedAt));
      setDurationSec(res.durationSeconds);
      setDevMode(res.devMode);
      // Lock the editor to the interviewer-assigned language, if any.
      if (isLanguage(res.assignedLanguage)) {
        setLockedLanguage(res.assignedLanguage);
        setLanguage(res.assignedLanguage);
      }

      // Render the room IMMEDIATELY — the typed experience must NEVER be blocked by mic setup.
      // (A slow/denied mic, a user lingering on the permission prompt, or an AudioContext stall must
      // not leave the candidate stuck on a loading screen.)
      setStage(res.phase === 'done' ? 'done' : 'interview');

      // Mic was already requested in the begin gesture above (one-click flow). Arm voice only if it
      // was granted; otherwise typed mode stays fully usable. If NEXT_PUBLIC_VOICE_WS_URL is unset,
      // voice is simply unavailable (typed only).
      if (VOICE_WS_URL && res.phase !== 'done' && micGranted) {
        lastExpectsRef.current = res.utterance.expects;
        setVoiceMode(true);
        setVoiceSocketEnabled(true);
        // Gate the mic through the AEC convergence window (the greeting plays during it) so the very
        // first candidate turn isn't polluted by un-cancelled greeting echo.
        micCooldownUntilRef.current = Date.now() + AEC_WARMUP_MS;
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start interview.');
      setStage('error');
    }
  }

  // Candidate ends the interview early (top-bar End button, behind a confirm dialog). Submits what's
  // there via /finish and freezes the room. Shares concludeCalledRef with the timer/phase-done paths
  // so /finish never double-fires.
  async function handleEndInterview() {
    if (!activeToken || concludeCalledRef.current) return;
    concludeCalledRef.current = true;
    setStage('done');
    try {
      await finishInterview(id, activeToken);
    } catch {
      // Idempotent server-side — ignore.
    }
  }

  async function handleSendAnswer() {
    if (!activeToken || !answer.trim() || aiThinking) return;
    const text = answer.trim();
    // Reuse the requestId when resending the SAME answer so the server dedupes a retry
    // after a lost response; a fresh answer gets a new id.
    const requestId =
      pendingAnswerRef.current?.text === text
        ? pendingAnswerRef.current.requestId
        : crypto.randomUUID();
    pendingAnswerRef.current = { text, requestId };
    setAnswer('');
    setAnswerError(null);
    setMessages((prev) => [...prev, { role: 'candidate', text }]);
    setAiThinking(true);
    try {
      const res = await answerInterview(id, activeToken, text, requestId);
      pendingAnswerRef.current = null;
      setPhase(res.phase);
      // Carry the assist tag onto the live bubble (follow-up probe / accepted-offer hint) so the
      // intervention styling shows immediately, exactly as a reload would restore it.
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: res.utterance.text,
          ...(res.assist ? { assist: res.assist.kind } : {}),
        },
      ]);
      void speak('turn'); // speak the interviewer's reply (P1)
      if (res.phase === 'done') {
        setStage('done');
      }
    } catch (err: unknown) {
      // Roll back the optimistic bubble + refill the box so the candidate can resend —
      // never inject a fake AI error message into the transcript.
      setMessages((prev) => prev.slice(0, -1));
      setAnswer(text);
      setAnswerError(
        err instanceof Error ? err.message : 'Failed to send answer. Please try again.'
      );
    } finally {
      setAiThinking(false);
    }
  }

  // Coding controls. SUBMIT fires the mandatory counter-question (the USP) and carries the editor
  // code so the question anchors on it (B1); MOVE-ON is a firm forward skip. Both drive the same
  // /answer FSM as a typed answer, just with an explicit intent — the machine owns the outcome.
  async function sendCodingIntent(intent: 'submit' | 'move_on') {
    // NOTE: do NOT gate on voiceSpeakingRef here — SUBMIT/MOVE-ON are deliberate controls and must
    // always act. If the interviewer is mid-utterance, the new turn's speak() supersedes it
    // (speakSeqRef), so the intro audio yields to the counter-question. Gating on it silently
    // no-ops the click while the coding intro is still playing.
    if (!activeToken || submitting || aiThinking || running) return;
    const requestId = crypto.randomUUID();
    setSubmitting(true);
    setAnswerError(null);
    if (intent === 'submit') {
      setMessages((prev) => [...prev, { role: 'candidate', text: 'Submitted my solution.' }]);
    }
    setAiThinking(true);
    try {
      const res = await answerInterview(
        id,
        activeToken,
        '',
        requestId,
        intent,
        intent === 'submit' ? code : undefined
      );
      setPhase(res.phase);
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: res.utterance.text,
          ...(res.assist ? { assist: res.assist.kind } : {}),
        },
      ]);
      void speak('turn');
      if (res.phase === 'done') setStage('done');
    } catch (err: unknown) {
      // Roll back the optimistic submit bubble; surface the reason (incl. the B2 "not enough time —
      // use Move On" 409) inline so the candidate knows what to do next.
      if (intent === 'submit') setMessages((prev) => prev.slice(0, -1));
      setAnswerError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setAiThinking(false);
      setSubmitting(false);
    }
  }
  const handleSubmitCode = () => void sendCodingIntent('submit');
  const handleMoveOn = () => {
    setMoveOnOpen(false);
    void sendCodingIntent('move_on');
  };

  // Flash a brief "Pasting is disabled" hint when a paste/drop is blocked.
  const handlePasteBlocked = useCallback(() => {
    setPasteBlocked(true);
    if (pasteHintTimer.current) clearTimeout(pasteHintTimer.current);
    pasteHintTimer.current = setTimeout(() => setPasteBlocked(false), 2500);
  }, []);

  // Stop any audio on unmount (both the chunked <audio> path and the streamed Web Audio path).
  useEffect(
    () => () => {
      audioRef.current?.pause();
      stopTtsStreamRef.current?.();
      void ttsCtxRef.current?.close().catch(() => undefined);
    },
    []
  );

  // Speak the latest interviewer utterance (P1). Best-effort — never throws into the flow. A token
  // override is needed right after begin() (the state token hasn't flushed yet). source='run'
  // voices a run-triggered hint (which lives on the code run, not the transcript).
  const speak = useCallback(
    async (source: 'turn' | 'run', tokenOverride?: string, textOverride?: string) => {
      const tok = tokenOverride ?? activeToken;
      if (!tok) return;
      const seq = ++speakSeqRef.current; // a newer turn supersedes this playback
      firstAudioAtRef.current = null; // fresh utterance — a stale stamp must never be attributed
      audioRef.current?.pause();
      // Cancel any in-flight STREAMED playback from a previous turn (aborts its fetch + stops its
      // scheduled Web Audio sources) — the <audio> pause above only covers the chunked path.
      stopTtsStreamRef.current?.();
      stopTtsStreamRef.current = null;
      // Half-duplex: mark the interviewer as speaking so onFrame drops mic frames for the duration
      // (else the mic captures our own greeting/reply as a phantom candidate turn — self-echo).
      voiceSpeakingRef.current = true;

      try {
        // STREAMING path (P1-B): play the whole utterance progressively from /speak-stream — first
        // audio at ~TTFB. On ANY failure before audio starts (503/404/502, no body, decode error)
        // fall through to the proven chunked path below.
        if (TTS_STREAMING) {
          const ctrl = new AbortController();
          let stopPlayback: (() => void) | null = null;
          const stopAll = () => {
            ctrl.abort();
            stopPlayback?.();
          };
          stopTtsStreamRef.current = stopAll;
          // Watchdog also covers the pre-headers fetch window, so a hung request can never leave
          // the mic gated; playback itself has a second (idempotent) watchdog inside playPcmStream.
          const watchdog = setTimeout(stopAll, TTS_STREAM_WATCHDOG_MS);
          let streamed = false;
          try {
            const res = await speakStream(id, tok, source, ctrl.signal, textOverride);
            if (seq !== speakSeqRef.current) return; // superseded while fetching
            if (res?.body) {
              let ctx = ttsCtxRef.current;
              if (!ctx) ttsCtxRef.current = ctx = new AudioContext();
              if (ctx.state === 'suspended') void ctx.resume();
              const sampleRate = Number(res.headers.get('X-Sample-Rate') || '') || 24000;
              streamed = await playPcmStream({
                body: res.body,
                ctx,
                sampleRate,
                isCancelled: () => seq !== speakSeqRef.current,
                registerStop: (s) => {
                  stopPlayback = s;
                },
                onFirstAudio: () => {
                  if (seq === speakSeqRef.current) firstAudioAtRef.current = performance.now();
                },
              });
            }
          } finally {
            clearTimeout(watchdog);
            if (stopTtsStreamRef.current === stopAll) stopTtsStreamRef.current = null;
          }
          if (streamed || seq !== speakSeqRef.current) return;
          // else: nothing was played — fall back to the chunked per-sentence path.
        }

        const first = await speakChunk(id, tok, source, 0, textOverride);
        if (!first || seq !== speakSeqRef.current) return;

        // Prefetch the remaining sentences in parallel so playback is gapless after the first one,
        // while the first sentence already starts playing in ~1–2s.
        const pending: Array<ReturnType<typeof speakChunk>> = [Promise.resolve(first)];
        for (let i = 1; i < first.count; i++)
          pending.push(speakChunk(id, tok, source, i, textOverride));

        for (let i = 0; i < first.count; i++) {
          const r = await pending[i];
          if (!r || seq !== speakSeqRef.current) return;
          await new Promise<void>((resolve) => {
            const url = URL.createObjectURL(r.blob);
            const a = new Audio(url);
            audioRef.current = a;
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              URL.revokeObjectURL(url);
              resolve();
            };
            // Hard cap so a stalled <audio> element can NEVER hang this await. If it did, the turn's
            // finally would never run, the mic would never re-arm, and the room would be "stuck in
            // speaking". 30s matches the server's spoken-ack timeout (ws_sink ack_timeout_s).
            const timer = setTimeout(() => {
              a.pause();
              done();
            }, 30_000);
            a.addEventListener('ended', done);
            a.addEventListener('error', done);
            if (i === 0) {
              // Chunked-fallback TTFB: the first clip's 'playing' event is the felt first word.
              a.addEventListener(
                'playing',
                () => {
                  if (seq === speakSeqRef.current && firstAudioAtRef.current == null)
                    firstAudioAtRef.current = performance.now();
                },
                { once: true }
              );
            }
            a.play().catch(done); // autoplay rejection → skip, room stays usable
          });
          if (seq !== speakSeqRef.current) return; // cancelled mid-clip
        }
      } finally {
        // Release the half-duplex gate — but only if a newer utterance hasn't taken over (it owns
        // the flag then). Guarantees the mic resumes even if playback errored or timed out. Start a
        // short cooldown so the speaker/room tail can't echo into the mic as a phantom turn.
        if (seq === speakSeqRef.current) {
          voiceSpeakingRef.current = false;
          micCooldownUntilRef.current = Date.now() + SPEAK_TAIL_COOLDOWN_MS;
        }
      }
    },
    [activeToken, id]
  );

  // Keep speakRef in sync so voice cue handlers always call the latest speak().
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // Track candidate liveness for the idle detector: every keystroke resets the idle clock so a
  // candidate who is actively typing (or thinking between keystrokes) is never nudged. Stable
  // (deps []) so the CodeMirror instance's captured callback never goes stale.
  const handleCodeChange = useCallback((value: string) => {
    lastKeystrokeRef.current = Date.now();
    setCode(value);
  }, []);

  const handleRunCode = useCallback(async () => {
    if (!activeToken || running) return;
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const result = await apiRunCode(id, activeToken, language, code);
      setRunResult(result);
      // The autonomous interviewer may step in on a struggling run — surface it in the chat
      // immediately. It rides on the code run (not the transcript); resume() restores the latest.
      if (result.intervention?.text) {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: result.intervention!.text, assist: result.intervention!.kind },
        ]);
        void speak('run'); // speak the run-triggered hint (P1)
      }
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'Code execution failed.');
    } finally {
      setRunning(false);
      lastRunAtRef.current = Date.now(); // a run is activity — resets the idle clock
    }
  }, [id, activeToken, language, code, running, speak]);

  // ── Path B: compound-idle detector (stuck-not-running) ───────────────────────────────────────
  // Poll while in the room. When coding AND the candidate has been idle (no keystroke, no run) past
  // the protected window AND the interviewer isn't speaking, ask the server whether to check in.
  // The server owns the real decision (feature flag + per-question cap + gates); this only reports
  // idleness and voices whatever comes back. All refs are read live to avoid a stale-closure capture.
  const maybeIdleNudge = useCallback(async () => {
    const tok = activeTokenRef.current;
    if (!tok) return;
    if (phaseRef.current !== 'coding') return;
    if (concludeCalledRef.current) return; // interview is concluding
    if (runningRef.current) return; // a run is in flight
    if (voiceSpeakingRef.current) return; // interviewer is speaking
    if (nudgeInFlightRef.current) return; // one poll at a time
    if (Date.now() < nudgeCooldownUntilRef.current) return; // asked recently — don't spam the server

    // Dev interviews are 2 minutes long — compress the windows so the (server-flagged) behavior is
    // exercisable end-to-end. devMode is server-authoritative, never candidate-controlled.
    const idleWindowMs = devModeRef.current ? DEV_IDLE_WINDOW_MS : IDLE_WINDOW_MS;
    const blankFloorMs = devModeRef.current
      ? DEV_IDLE_BLANK_MIN_PROBLEM_MS
      : IDLE_BLANK_MIN_PROBLEM_MS;

    const now = Date.now();
    const idleFor = now - Math.max(lastKeystrokeRef.current, lastRunAtRef.current);
    if (idleFor < idleWindowMs) return; // still active / thinking — protected

    const codeLen = codeRef.current.trim().length;
    // A blank editor early in a problem is planning, not a stall — give extra up-front think time.
    if (codeLen < IDLE_BLANK_MAX_CHARS) {
      const problemElapsedMs = (elapsedRef.current - problemStartElapsedRef.current) * 1000;
      if (problemElapsedMs < blankFloorMs) return;
    }

    nudgeInFlightRef.current = true;
    try {
      const res = await nudgeCandidate(id, tok, codeLen);
      if (res.intervention?.text) {
        // Reset the idle clock so we don't immediately re-evaluate right after checking in.
        lastKeystrokeRef.current = Date.now();
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: res.intervention!.text, assist: res.intervention!.kind },
        ]);
        // Voice the exact utterance we just rendered (idle markers ride the code-run channel).
        void speak('run', undefined, res.intervention.text);
      }
    } catch {
      // Best-effort — a failed idle poll is silent.
    } finally {
      // Whatever happened (delivered, server said quiet, or error), don't ask again for a full idle
      // window — a still-idle candidate must never turn the poll into a request stream.
      nudgeCooldownUntilRef.current = Date.now() + idleWindowMs;
      nudgeInFlightRef.current = false;
    }
  }, [id, speak]);

  useEffect(() => {
    if (stage !== 'interview') return;
    const timer = setInterval(() => void maybeIdleNudge(), IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [stage, maybeIdleNudge]);

  function handleAnswerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mirror Supabase's composer: Enter sends, Shift+Enter inserts a newline. Guard IME
    // composition so committing CJK text with Enter never submits mid-compose.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendAnswer();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (stage === 'error') {
    return <ErrorCard message={errorMsg} />;
  }

  if (stage === 'loading_token') {
    return <LoadingScreen text="Starting your interview…" />;
  }

  // STAGE 1 — Consent
  if (stage === 'consent') {
    const cameraDenied = cameraState === 'denied' || cameraState === 'error';
    const cameraRequesting = consentCameraState === 'requesting' || cameraState === 'requesting';

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-lg bg-card border border-border rounded-xl p-8 space-y-6">
          {/* Wordmark */}
          <div className="text-center flex flex-col items-center gap-1">
            <Wordmark />
            <p className="text-sm text-muted-foreground mt-1">Technical Interview Platform</p>
          </div>

          {/* T&C notice */}
          <div className="bg-muted border border-border rounded-lg p-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground">Before you begin</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>This session is being recorded for evaluation purposes.</li>
              <li>Your responses are evaluated automatically as part of this assessment.</li>
              <li>Do not share your session link with others.</li>
              <li>Attempting to use unauthorized resources may affect your evaluation.</li>
              <li>
                <strong className="text-foreground">
                  This interview is proctored. Your camera and microphone are required.
                </strong>{' '}
                Face presence and additional people in the room are analyzed{' '}
                <strong className="text-foreground">entirely in your browser</strong> — no video is
                recorded or uploaded. Your microphone is used to transcribe your spoken answers;
                audio is streamed for speech-to-text and is not stored. Only anonymized session
                flags and transcripts are sent.
              </li>
            </ul>
            <p>
              By clicking <strong className="text-foreground">I agree &amp; start</strong>, you
              confirm that you have read and accepted these terms.
            </p>
          </div>

          {/* Camera denied / error banner */}
          {cameraDenied && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p className="font-medium">
                  Camera access is required for this proctored interview.
                </p>
                <p className="text-destructive/80">
                  Enable your camera in your browser settings and click the button below to try
                  again.
                </p>
              </div>
            </div>
          )}

          {/* Camera granted confirmation */}
          {cameraState === 'granted' && (
            <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-success">
              <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Camera access granted — your video is not recorded or uploaded.</span>
            </div>
          )}

          <Button
            data-testid="consent-begin"
            onClick={() => void handleBegin()}
            disabled={cameraRequesting}
            className="w-full h-11 rounded-md bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60"
          >
            {cameraRequesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Requesting camera…
              </>
            ) : cameraDenied ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry camera &amp; start
              </>
            ) : cameraState === 'granted' ? (
              'I agree & start'
            ) : (
              'I agree & start'
            )}
          </Button>
        </div>
      </div>
    );
  }

  // STAGE 2 — Interview (split-pane) + Done state
  const isDone = stage === 'done' || phase === 'done';
  const phaseIdx = Math.max(0, PHASE_ORDER.indexOf(phase));
  const progressPct = (phaseIdx / (PHASE_ORDER.length - 1)) * 100;

  return (
    <div
      data-testid="interview-root"
      data-phase={phase}
      className="h-[100svh] bg-background text-foreground flex flex-col overflow-hidden"
    >
      {/* Transient hint when a paste/drop is blocked (integrity). */}
      {pasteBlocked && (
        <div
          role="status"
          className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg"
        >
          Pasting is disabled for this interview.
        </div>
      )}

      {/* Minimal top strip */}
      <header className="h-11 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        {/* Left: wordmark + elapsed timer. */}
        <div className="flex items-center gap-3">
          <Wordmark className="scale-90 origin-left" />
          <span
            className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground"
            title="Elapsed time"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatTime(elapsed)}
          </span>
          {/* Live FSM state — the product being honest about where the machine is. */}
          <span
            className="hidden items-center gap-1.5 font-mono text-[11px] text-foreground-subtle sm:flex"
            title="Current interview state"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70"
              aria-hidden="true"
            />
            state: <span className="text-foreground">{phase}</span>
          </span>
        </div>

        {/* Right: room controls — passive device status (camera/mic/audio are REQUIRED, no disable),
            the single collapse/expand toggle, and End. Interview only. */}
        {!isDone && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <DeviceIndicator
                icon={Camera}
                on={cameraState === 'granted'}
                title="Camera on — checked in your browser, never recorded"
              />
              {!!VOICE_WS_URL && (
                <DeviceIndicator
                  icon={Mic}
                  on={voiceMode && micState === 'granted'}
                  live={micForwarding}
                  title="Microphone on — your spoken answers are transcribed"
                />
              )}
              <DeviceIndicator
                icon={Volume2}
                on
                title="Interviewer audio on — you'll hear the interviewer"
              />
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                onClick={() => animateChatPanel(chatCollapsed ? 'expand' : 'collapse')}
                title={chatCollapsed ? 'Show interviewer panel' : 'Hide interviewer panel'}
                aria-label={chatCollapsed ? 'Show interviewer panel' : 'Hide interviewer panel'}
                className="rounded-input p-1 text-foreground-subtle transition-colors hover:text-foreground"
              >
                {chatCollapsed ? (
                  <PanelRightOpen className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* End the interview early — confirm dialog, candidate token drives /finish. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  End
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End the interview?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This submits your responses so far and ends the session. You won&apos;t be able
                    to return.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep going</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleEndInterview()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    End interview
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </header>

      {/* MOVE-ON confirmation (controlled) — forward-only, so make the one-way step explicit. */}
      <AlertDialog open={moveOnOpen} onOpenChange={setMoveOnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to the next problem?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current code is saved as your answer to this problem. Finite runs forward only —
              you won&apos;t be able to come back to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on this problem</AlertDialogCancel>
            <AlertDialogAction onClick={handleMoveOn}>Move on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase progress — fills as the interview advances greeting → done */}
      <div className="h-0.5 shrink-0 bg-border" aria-hidden="true">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {isDone ? (
        // Done state — full-width thank-you
        <div className="flex-1 flex items-center justify-center px-4">
          <div
            data-testid="interview-done"
            data-concluded-by-time={concludedByTime ? 'true' : 'false'}
            className="w-full max-w-md bg-card border border-success/40 rounded-xl p-8 text-center space-y-4"
          >
            <CheckCircle className="w-10 h-10 text-success mx-auto" />
            <h2 className="text-base font-medium text-foreground">
              {concludedByTime ? 'Time’s up — interview concluded' : 'Interview complete'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {concludedByTime
                ? 'The interview reached its time limit. Your responses so far have been submitted and will be reviewed shortly.'
                : 'Thank you for completing this interview. Your responses have been submitted and will be reviewed shortly.'}
            </p>
          </div>
        </div>
      ) : (
        // Split-pane interview layout — editor + output | AI chat
        <ResizablePanelGroup
          direction={isMobile ? 'vertical' : 'horizontal'}
          className="flex-1 overflow-hidden"
        >
          {/* LEFT — problem dock + editor + terminal console. The dock is a nested split (user
              pick: LeetCode-style "split dock" — statement and code visible together). Panels are
              keyed so the editor keeps identity (no CodeMirror remount) when the dock mounts at
              the coding handoff or is collapsed to the rail. */}
          <ResizablePanel defaultSize={61.8} minSize={30} className={chatAnimClass}>
            <div
              className={
                isMobile ? 'flex h-full flex-col overflow-hidden' : 'flex h-full overflow-hidden'
              }
            >
              {phase === 'coding' && codingProblem && !problemOpen && (
                <button
                  type="button"
                  onClick={() => setProblemOpen(true)}
                  data-testid="problem-rail"
                  aria-label="Open problem panel"
                  className={
                    isMobile
                      ? 'flex h-8 w-full shrink-0 items-center justify-center gap-2 border-b border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
                      : 'flex h-full w-7 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
                  }
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={isMobile ? undefined : { writingMode: 'vertical-rl' }}
                  >
                    Problem
                  </span>
                </button>
              )}
              <ResizablePanelGroup
                direction={isMobile ? 'vertical' : 'horizontal'}
                className="flex-1"
              >
                {phase === 'coding' && codingProblem && problemOpen && (
                  <>
                    <ResizablePanel
                      key="problem-dock"
                      id="problem-dock"
                      order={1}
                      defaultSize={38.2}
                      minSize={20}
                      maxSize={55}
                    >
                      <ProblemDock
                        problem={codingProblem}
                        clock={formatTime(Math.max(0, elapsed - problemStartElapsedRef.current))}
                        overBudget={
                          elapsed - problemStartElapsedRef.current > PROBLEM_SOFT_BUDGET_S
                        }
                        onCollapseAction={() => setProblemOpen(false)}
                      />
                    </ResizablePanel>
                    <ResizableHandle
                      withHandle
                      className={isMobile ? 'h-px bg-border' : 'w-px bg-border'}
                    />
                  </>
                )}
                <ResizablePanel key="editor-col" id="editor-col" order={2} minSize={40}>
                  <div className="h-full flex flex-col overflow-hidden bg-surface-deep">
                    {/* Editor top rail — continues the h-10 header seam across all three panels
                        (problem dock · editor · chat), so the horizontal grid line never breaks. */}
                    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        solution.{LANG_EXT[language] ?? language}
                      </span>
                    </div>

                    {/* Editor — fills remaining vertical space; Run + language live in the console. */}
                    <div className="flex-1 overflow-hidden">
                      <EnhancedCodeMirrorEditor
                        value={code}
                        onCodeChangeAction={handleCodeChange}
                        onCursorPositionChangeAction={(line, col) => setCursor({ line, col })}
                        language={language}
                        onExecuteAction={handleRunCode}
                        isExecuting={running}
                        pasteDisabled={!devMode}
                        onPasteBlockedAction={handlePasteBlocked}
                      />
                    </div>

                    {/* Terminal output — fixed-height console strip */}
                    <div className="shrink-0 h-[23.6%] min-h-[150px] border-t border-border bg-surface-deep overflow-auto p-3 font-mono text-[11px]">
                      {/* Console header — Run + language live here so the editor keeps a single top bar. */}
                      <div className="mb-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleRunCode}
                          loading={running}
                          variant="outline"
                          className="h-6 gap-1 rounded-md border border-success/40 bg-success/10 px-3 font-mono text-[10px] text-success transition-colors hover:bg-success/20 focus-visible:ring-ring"
                        >
                          {!running && <Play className="h-3 w-3 fill-current" />}
                          RUN
                        </Button>
                        {lockedLanguage ? (
                          <div
                            className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-muted px-2 font-mono text-[10px] text-muted-foreground"
                            title="Language set by the interviewer"
                          >
                            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {LANGUAGES.find((l) => l.value === lockedLanguage)?.label ??
                              lockedLanguage}
                          </div>
                        ) : (
                          <Select
                            value={language}
                            onValueChange={(v) => {
                              setLanguage(v as Language);
                              if (typeof window !== 'undefined') localStorage.setItem(langKey, v);
                            }}
                          >
                            <SelectTrigger className="h-6 w-28 border-border bg-muted font-mono text-[10px] text-foreground focus-visible:ring-ring">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-border bg-card text-foreground">
                              {LANGUAGES.map((l) => (
                                <SelectItem
                                  key={l.value}
                                  value={l.value}
                                  className="font-mono text-xs focus:bg-muted"
                                >
                                  {l.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* SUBMIT (mandatory counter-question) + MOVE ON (firm forward skip) — the
                            two coding-phase controls beside RUN. RUN tests; SUBMIT locks + is probed;
                            MOVE ON skips. Only shown during coding. */}
                        {phase === 'coding' && (
                          <>
                            <Button
                              size="sm"
                              onClick={handleSubmitCode}
                              loading={submitting}
                              disabled={running || submitting || aiThinking || !code.trim()}
                              data-testid="submit-code"
                              title="Submit your solution — the interviewer will follow up on it"
                              className="h-6 gap-1 rounded-md bg-primary px-3 font-mono text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-ring"
                            >
                              {!submitting && <Check className="h-3 w-3" />}
                              SUBMIT
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMoveOnOpen(true)}
                              disabled={running || submitting || aiThinking}
                              data-testid="move-on"
                              title="Move on to the next problem — you can't return"
                              className="h-6 gap-1 rounded-md border-border px-3 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-ring"
                            >
                              <ArrowRight className="h-3 w-3" />
                              MOVE ON
                            </Button>
                          </>
                        )}
                        <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                          OUTPUT
                        </span>
                        {running && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>

                      {/* No auto-advance on all-tests-pass (research: every platform requires an
                          explicit submit). A clean sample run nudges toward SUBMIT without moving on. */}
                      {phase === 'coding' && runResult && runResult.exitCode === 0 && !running && (
                        <p className="mb-2 font-mono text-[10px] text-success">
                          Sample run passed — press SUBMIT when you're ready to move on.
                        </p>
                      )}

                      {runError && (
                        <Alert className="mb-2 border-destructive/40 bg-destructive/10 py-2 px-3">
                          <AlertDescription className="text-destructive text-xs font-mono">
                            {runError}
                          </AlertDescription>
                        </Alert>
                      )}
                      {runResult ? (
                        <div
                          className="space-y-1"
                          data-testid="run-output"
                          role="status"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          <div className="flex items-center gap-3 text-muted-foreground text-[10px] uppercase tracking-wider font-mono">
                            <span
                              data-testid="run-status"
                              className={
                                runResult.exitCode === 0 ? 'text-success' : 'text-destructive'
                              }
                            >
                              {runResult.status}
                            </span>
                            {runResult.timeMs != null ? <span>{runResult.timeMs}ms</span> : null}
                            {runResult.memoryKb ? (
                              <span>{Math.round(runResult.memoryKb / 1024)}KB</span>
                            ) : null}
                          </div>
                          {runResult.compileOutput && (
                            <pre className="text-destructive whitespace-pre-wrap break-all">
                              {runResult.compileOutput}
                            </pre>
                          )}
                          {runResult.stdout && (
                            <pre className="text-foreground whitespace-pre-wrap break-all">
                              {runResult.stdout}
                            </pre>
                          )}
                          {runResult.stderr && (
                            <pre className="text-destructive whitespace-pre-wrap break-all">
                              {runResult.stderr}
                            </pre>
                          )}
                          {!runResult.stdout && !runResult.stderr && !runResult.compileOutput && (
                            <span className="text-muted-foreground">(no output)</span>
                          )}
                        </div>
                      ) : (
                        !runError && (
                          <span className="text-muted-foreground">
                            Run your code to see output here.
                          </span>
                        )
                      )}
                    </div>

                    {/* Status bar — Replit-style */}
                    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-card px-3 font-mono text-[10px] text-muted-foreground">
                      <span>
                        Ln {cursor.line}, Col {cursor.col}
                      </span>
                      <span className="text-foreground-ghost">·</span>
                      <span className="capitalize">{language}</span>
                      <span className="text-foreground-ghost">·</span>
                      <span>Spaces: 4</span>
                      <span className="ml-auto">UTF-8</span>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>

          {/* 1px crisp divider */}
          <ResizableHandle withHandle className={isMobile ? 'h-px bg-border' : 'w-px bg-border'} />

          {/* RIGHT — AI chat / oral widget */}
          <ResizablePanel
            ref={chatPanelRef}
            defaultSize={38.2}
            minSize={25}
            collapsible
            collapsedSize={0}
            onCollapse={() => setChatCollapsed(true)}
            onExpand={() => setChatCollapsed(false)}
            className={`relative overflow-hidden ${chatAnimClass}`}
          >
            <div
              ref={chatInnerRef}
              className={
                chatSlideW != null
                  ? 'absolute inset-y-0 left-0 flex flex-col overflow-hidden bg-surface-200'
                  : 'flex h-full w-full flex-col overflow-hidden bg-surface-200'
              }
              style={chatSlideW != null ? { width: chatSlideW } : undefined}
            >
              {/* Pane header — single assistant identity (no per-message labels) */}
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
                <span
                  aria-hidden="true"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 11.5 8 3l5 8.5" />
                    <path d="M5.5 11.5h5" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-foreground">Interviewer</span>

                {/* Voice status pill — only visible when voice mode is active */}
                {voiceMode && (
                  <span
                    className={[
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium',
                      micForwarding
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : voiceSpeakingRef.current
                          ? 'bg-muted text-muted-foreground border border-border'
                          : socketStatus === 'connecting'
                            ? 'bg-muted text-muted-foreground border border-border'
                            : 'bg-muted text-muted-foreground border border-border',
                    ].join(' ')}
                    aria-live="polite"
                  >
                    {micForwarding ? (
                      <>
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                        </span>
                        Listening
                      </>
                    ) : socketStatus === 'connecting' ? (
                      <>
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Connecting
                      </>
                    ) : socketStatus === 'failed' ? (
                      'Voice off'
                    ) : (
                      'Speaking'
                    )}
                  </span>
                )}
              </div>

              {/* Transcript scroll area. (The coding problem no longer lives here — it's the
                  ProblemDock split beside the editor, in the left pane.) */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((msg, idx) => {
                  const isCandidate = msg.role === 'candidate';
                  return (
                    <div
                      key={idx}
                      data-testid={isCandidate ? 'candidate-message' : 'ai-message'}
                      data-assist={msg.role === 'ai' && msg.assist ? msg.assist : undefined}
                      className={`flex flex-col gap-1 ${isCandidate ? 'items-end' : 'items-start'}`}
                    >
                      {/* Per-message speaker label — the clearest contrast cue (who said what). */}
                      <span
                        className={`px-0.5 text-[10px] font-mono uppercase tracking-wider ${
                          isCandidate ? 'text-primary/80' : 'text-foreground-subtle'
                        }`}
                      >
                        {isCandidate ? 'You' : 'Interviewer'}
                      </span>
                      <div
                        className={[
                          'max-w-[88%] px-4 py-2.5 text-[13px] leading-relaxed',
                          isCandidate
                            ? // You: ember-tinted, right-aligned, medium weight.
                              'whitespace-pre-wrap border border-primary/40 bg-primary/15 font-medium text-foreground'
                            : msg.assist
                              ? // Autonomous intervention: ember left-accent.
                                'border-l-2 border-primary bg-primary/5 font-normal text-foreground'
                              : // Interviewer: neutral bordered card, prose weight — sits a shade
                                // above the lighter chat panel so it reads as a distinct message.
                                'border border-border bg-card font-normal text-foreground',
                        ].join(' ')}
                      >
                        {msg.role === 'ai' && msg.assist && (
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {assistLabel(msg.assist)}
                          </div>
                        )}
                        {msg.role === 'ai' ? <MarkdownMessage text={msg.text} /> : msg.text}
                      </div>
                    </div>
                  );
                })}

                {aiThinking && (
                  <div
                    className="flex justify-start"
                    data-testid="ai-thinking"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2 bg-card px-4 py-2.5 text-[13px] font-medium italic text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>Interviewer is thinking…</span>
                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />
              </div>

              {/* Answer input — Assistant Chat style: expanding textarea + inset send */}
              <div className="shrink-0 border-t border-border p-3">
                {answerError && (
                  <Alert className="mb-2 border-destructive/40 bg-destructive/10 px-3 py-2">
                    <AlertDescription className="flex items-center justify-between gap-3 text-xs text-destructive">
                      <span>{answerError}</span>
                      <button
                        type="button"
                        onClick={() => setAnswerError(null)}
                        className="shrink-0 underline underline-offset-2"
                      >
                        Dismiss
                      </button>
                    </AlertDescription>
                  </Alert>
                )}
                {/* Composer mirrors Supabase Studio's AI assistant input: the border + 6px radius
                    live on the textarea, a barely-there foreground tint as the surface, weight-400
                    text, and a 28px circular primary send button inset 6px (model selector omitted).
                    Enter sends, Shift+Enter newlines — no hint line, matching Supabase. */}
                <div className="relative">
                  <textarea
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      lastKeystrokeRef.current = Date.now(); // composing a message = engaged, not stalled
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 256)}px`;
                    }}
                    onKeyDown={handleAnswerKeyDown}
                    onPaste={(e) => {
                      if (!devMode) {
                        e.preventDefault();
                        handlePasteBlocked();
                      }
                    }}
                    onDrop={(e) => {
                      if (!devMode) {
                        e.preventDefault();
                        handlePasteBlocked();
                      }
                    }}
                    disabled={aiThinking}
                    placeholder="Type your answer…"
                    rows={1}
                    spellCheck={false}
                    className="box-border block max-h-64 w-full resize-none rounded-input border border-border bg-foreground/[0.026] px-3 py-2 pb-9 pr-10 text-sm font-normal text-foreground transition-colors placeholder:text-foreground-subtle focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  />
                  {/* Footer overlay — model selector excluded; send button right-aligned. pointer-events
                      pass through the empty area so clicks still land in the textarea. */}
                  <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleSendAnswer}
                      disabled={aiThinking || !answer.trim()}
                      aria-label="Send answer"
                      className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-primary p-0 text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 disabled:opacity-50"
                    >
                      {aiThinking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
