'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
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
  beginInterview,
  answerInterview,
  runCode as apiRunCode,
  speakChunk,
  finishInterview,
  getInterviewState,
  type InterviewPhase,
  type RunResult,
} from '@/lib/api';
import {
  AlertCircle,
  ArrowUp,
  Camera,
  CheckCircle,
  Clock,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Wordmark } from '@/components/marketing/wordmark';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import { useVoiceMic } from '@/lib/voice/use-voice-mic';
import { useVoiceSocket } from '@/lib/voice/use-voice-socket';
import { playFiller } from '@/lib/voice/play-filler';
import type { ServerReady, ServerTurnReady } from '@/lib/voice/types';
import { useCameraProctor } from '@/lib/proctor/use-camera-proctor';

const VOICE_WS_URL = process.env.NEXT_PUBLIC_VOICE_WS_URL ?? '';

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

const PHASE_LABELS: Record<InterviewPhase, string> = {
  greeting: 'Greeting',
  oral: 'Oral Q&A',
  handoff: 'Transition',
  coding: 'Coding',
  wrap_up: 'Wrap-up',
  done: 'Done',
};

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

function PhaseBadge({ phase }: { phase: InterviewPhase }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] uppercase tracking-widest border-primary/40 text-primary bg-primary/10 px-2 py-0.5 font-mono"
    >
      {PHASE_LABELS[phase] ?? phase}
    </Badge>
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
  const muteKey = `of_mute_${id}`;

  const [stage, setStage] = useState<Stage>('loading_token');
  const [errorMsg, setErrorMsg] = useState<string>('');
  /** Camera permission sub-state tracked during the consent stage. */
  const [consentCameraState, setConsentCameraState] = useState<ConsentCameraState>('idle');
  // Rotated session token used for all candidate calls after begin.
  const [activeToken, setActiveToken] = useState<string | null>(null);
  // Inline answer error (kept out of the transcript) so the candidate can resend.
  const [answerError, setAnswerError] = useState<string | null>(null);

  // Interview state
  const [phase, setPhase] = useState<InterviewPhase>('greeting');
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
  const [runError, setRunError] = useState<string | null>(null);
  // Voice (P1): the interviewer speaks its turns. Muteable; preference persists per interview.
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakSeqRef = useRef(0); // bumped to cancel in-flight playback on a new turn / mute

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
      if (!micForwardingRef.current) return;
      sendFrameRef.current?.(buf);
    }, []),
  });

  // Keep the forwarding ref current for the worklet's captured onFrame closure.
  useEffect(() => {
    micForwardingRef.current = micForwarding;
  }, [micForwarding]);

  // speak() is defined below but the socket cue handlers need it — use a ref.
  const speakRef = useRef<
    ((source: 'turn' | 'run', tokenOverride?: string) => Promise<void>) | null
  >(null);
  const activeTokenRef = useRef<string | null>(null);
  useEffect(() => {
    activeTokenRef.current = activeToken;
  }, [activeToken]);

  const handleVoiceReady = useCallback((cue: ServerReady) => {
    lastExpectsRef.current = cue.expects;
    // Arm mic forwarding if the server expects voice immediately.
    if (cue.expects === 'voice') setMicForwarding(true);
  }, []);

  const handleVoiceThinking = useCallback(() => {
    setMicForwarding(false);
    const tok = activeTokenRef.current;
    if (tok) void playFiller(id, tok, speakSeqRef);
  }, [id]);

  const handleVoiceTurnReady = useCallback(
    (cue: ServerTurnReady) => {
      lastExpectsRef.current = cue.utterance.expects;
      pendingVoiceRequestRef.current = cue.requestId;

      // Append candidate transcript bubble + interviewer utterance bubble.
      setMessages((prev) => [
        ...prev,
        { role: 'candidate' as const, text: cue.transcript },
        { role: 'ai' as const, text: cue.utterance.text },
      ]);
      setPhase(cue.phase as InterviewPhase);
      if (cue.phase === 'done') setStage('done');

      // Stop mic capture and play the interviewer's TTS via the existing speak() path.
      setMicForwarding(false);
      voiceSpeakingRef.current = true;

      const doSpeak = async () => {
        try {
          await speakRef.current?.('turn');
        } catch (err) {
          // speak() now always resolves (it has its own playback timeout), but guard anyway so the
          // finally — which re-arms the mic — can NEVER be skipped by an unexpected throw.
          console.error('[voice] interviewer playback failed', err);
        } finally {
          voiceSpeakingRef.current = false;
          // Ack playback so the server arms the next turn.
          sendSpokenRef.current?.(cue.requestId);
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
  const sendSpokenRef = useRef<((requestId: string) => void) | null>(null);
  const sendMicOffRef = useRef<(() => void) | null>(null);

  const {
    socketStatus,
    sendFrame,
    sendSpoken,
    sendMicOff,
    disconnect: disconnectVoice,
  } = useVoiceSocket({
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

  // Resume on reload / new tab (session token in localStorage), else consent for a fresh link.
  useEffect(() => {
    let cancelled = false;
    const saved = typeof window !== 'undefined' ? localStorage.getItem(sessionKey) : null;

    async function resume(tok: string) {
      try {
        const s = await getInterviewState(id, tok);
        if (cancelled) return;
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
      } catch {
        if (cancelled) return;
        setErrorMsg(
          'Your interview session could not be resumed on this device. If you have not finished, please contact your interviewer.'
        );
        setStage('error');
      }
    }

    if (saved) {
      setActiveToken(saved);
      void resume(saved);
    } else if (urlToken) {
      setStage('consent');
    } else {
      setErrorMsg('Invalid or missing interview link.');
      setStage('error');
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleBegin() {
    if (!urlToken) return;

    // Camera AND microphone are REQUIRED for proctored interviews. ONE click requests BOTH on the
    // same user gesture: startCamera() and startMic() are both INVOKED synchronously inside the
    // Promise.allSettled array, so each getUserMedia() fires within the activation window. We proceed
    // to beginInterview only if the camera is granted; a denied mic falls back to typed silently.
    // The "retry" button on the denied screen calls this same handler.
    let micGranted = micState === 'granted';
    if (cameraState !== 'granted') {
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
        // Camera denied/errored — stay on the consent screen; the denied banner shows.
        return;
      }
      // Camera granted — fall through to begin.
    }

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
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start interview.');
      setStage('error');
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
      setMessages((prev) => [...prev, { role: 'ai', text: res.utterance.text }]);
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

  // Flash a brief "Pasting is disabled" hint when a paste/drop is blocked.
  const handlePasteBlocked = useCallback(() => {
    setPasteBlocked(true);
    if (pasteHintTimer.current) clearTimeout(pasteHintTimer.current);
    pasteHintTimer.current = setTimeout(() => setPasteBlocked(false), 2500);
  }, []);

  // Load the mute preference once.
  useEffect(() => {
    if (typeof window !== 'undefined') setMuted(localStorage.getItem(muteKey) === '1');
  }, [muteKey]);

  // Stop any audio on unmount.
  useEffect(() => () => audioRef.current?.pause(), []);

  // Speak the latest interviewer utterance (P1). Best-effort — never throws into the flow. A token
  // override is needed right after begin() (the state token hasn't flushed yet). source='run'
  // voices a run-triggered hint (which lives on the code run, not the transcript).
  const speak = useCallback(
    async (source: 'turn' | 'run', tokenOverride?: string) => {
      const tok = tokenOverride ?? activeToken;
      if (!tok || muted) return;
      const seq = ++speakSeqRef.current; // a newer turn or mute supersedes this playback
      audioRef.current?.pause();

      const first = await speakChunk(id, tok, source, 0);
      if (!first || seq !== speakSeqRef.current || muted) return;

      // Prefetch the remaining sentences in parallel so playback is gapless after the first one,
      // while the first sentence already starts playing in ~1–2s.
      const pending: Array<ReturnType<typeof speakChunk>> = [Promise.resolve(first)];
      for (let i = 1; i < first.count; i++) pending.push(speakChunk(id, tok, source, i));

      for (let i = 0; i < first.count; i++) {
        const r = await pending[i];
        if (!r || seq !== speakSeqRef.current || muted) return;
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
          a.play().catch(done); // autoplay rejection → skip, room stays usable
        });
        if (seq !== speakSeqRef.current || muted) return; // cancelled mid-clip
      }
    },
    [activeToken, id, muted]
  );

  // Keep speakRef in sync so voice cue handlers always call the latest speak().
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(muteKey, next ? '1' : '0');
      if (next) {
        speakSeqRef.current++; // cancel any in-flight chunk playback
        audioRef.current?.pause();
      }
      return next;
    });
  }, [muteKey]);

  /** Toggle voice mode on/off. Entering voice re-requests the mic; leaving stops it. */
  const toggleVoiceMode = useCallback(async () => {
    if (!VOICE_WS_URL) return;
    if (voiceMode) {
      // Turn voice off — revert to typed.
      setVoiceMode(false);
      setVoiceSocketEnabled(false);
      setMicForwarding(false);
      stopMic();
      disconnectVoice();
    } else {
      // Turn voice on — request mic (requires a user gesture; this button click qualifies).
      try {
        await startMic();
        setVoiceMode(true);
        setVoiceSocketEnabled(true);
        if (lastExpectsRef.current === 'voice') setMicForwarding(true);
      } catch {
        // Mic denied — stay in typed mode silently.
      }
    }
  }, [voiceMode, stopMic, disconnectVoice, startMic]);

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
    }
  }, [id, activeToken, language, code, running, speak]);

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
              <li>Your responses will be assessed by an AI interviewer.</li>
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
    <div className="h-[100svh] bg-background text-foreground flex flex-col overflow-hidden">
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
        <Wordmark className="scale-90 origin-left" />
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground"
            title="Elapsed time"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatTime(elapsed)}
          </span>
          <PhaseBadge phase={phase} />
        </div>
      </header>

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
          <div className="w-full max-w-md bg-card border border-success/40 rounded-xl p-8 text-center space-y-4">
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
          {/* LEFT — editor + terminal console */}
          <ResizablePanel defaultSize={62} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden bg-background">
              {/* Code toolbar — language selector + Run pill */}
              <div className="flex h-10 items-center gap-2 px-3 border-b border-border bg-card shrink-0">
                {lockedLanguage ? (
                  // Interviewer assigned the language at creation — show it read-only.
                  <div
                    className="flex h-7 w-36 items-center gap-1.5 rounded-md border border-border bg-muted px-3 font-mono text-xs text-muted-foreground"
                    title="Language set by the interviewer"
                  >
                    <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {LANGUAGES.find((l) => l.value === lockedLanguage)?.label ?? lockedLanguage}
                  </div>
                ) : (
                  <Select
                    value={language}
                    onValueChange={(v) => {
                      setLanguage(v as Language);
                      // Persist so a reload/reconnect restores the candidate's choice.
                      if (typeof window !== 'undefined') localStorage.setItem(langKey, v);
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs bg-muted border-border text-foreground focus-visible:ring-ring font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      {LANGUAGES.map((l) => (
                        <SelectItem
                          key={l.value}
                          value={l.value}
                          className="text-xs focus:bg-muted font-mono"
                        >
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  size="sm"
                  onClick={handleRunCode}
                  loading={running}
                  className="h-7 px-4 text-xs rounded-md bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-ring gap-1.5 font-mono"
                  variant="outline"
                >
                  {!running && <Play className="w-3.5 h-3.5 fill-current" />}
                  RUN
                </Button>
              </div>

              {/* Editor — fills remaining vertical space */}
              <div className="flex-1 overflow-hidden">
                <EnhancedCodeMirrorEditor
                  value={code}
                  onCodeChangeAction={setCode}
                  onCursorPositionChangeAction={(line, col) => setCursor({ line, col })}
                  language={language}
                  onExecuteAction={handleRunCode}
                  isExecuting={running}
                  pasteDisabled={!devMode}
                  onPasteBlockedAction={handlePasteBlocked}
                />
              </div>

              {/* Terminal output — fixed-height console strip */}
              <div className="shrink-0 h-[180px] border-t border-border bg-background overflow-auto p-3 font-mono text-[11px]">
                {/* Console header label */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                    OUTPUT
                  </span>
                  {running && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </div>

                {runError && (
                  <Alert className="mb-2 border-destructive/40 bg-destructive/10 py-2 px-3">
                    <AlertDescription className="text-destructive text-xs font-mono">
                      {runError}
                    </AlertDescription>
                  </Alert>
                )}
                {runResult ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-muted-foreground text-[10px] uppercase tracking-wider font-mono">
                      <span
                        className={runResult.exitCode === 0 ? 'text-success' : 'text-destructive'}
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
                    <span className="text-muted-foreground">Run your code to see output here.</span>
                  )
                )}
              </div>

              {/* Status bar — Replit-style */}
              <div className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-card px-3 font-mono text-[10px] text-muted-foreground">
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

          {/* 1px crisp divider */}
          <ResizableHandle withHandle className={isMobile ? 'h-px bg-border' : 'w-px bg-border'} />

          {/* RIGHT — AI chat / oral widget */}
          <ResizablePanel defaultSize={38} minSize={25}>
            <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
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

                <div className="ml-auto flex items-center gap-1">
                  {/* Mic toggle — only rendered when VOICE_WS_URL is configured */}
                  {!!VOICE_WS_URL && (
                    <button
                      type="button"
                      onClick={() => void toggleVoiceMode()}
                      aria-label={voiceMode ? 'Switch to typed mode' : 'Switch to voice mode'}
                      aria-pressed={voiceMode}
                      title={
                        voiceMode
                          ? 'Voice on — click to use keyboard'
                          : 'Click to speak your answers'
                      }
                      className={[
                        'rounded-input p-1 transition-colors',
                        voiceMode
                          ? 'text-primary hover:text-primary/80'
                          : 'text-foreground-subtle hover:text-foreground',
                      ].join(' ')}
                    >
                      {voiceMode ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute interviewer voice' : 'Mute interviewer voice'}
                    aria-pressed={muted}
                    className="rounded-input p-1 text-foreground-subtle transition-colors hover:text-foreground"
                  >
                    {muted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-primary" />
                    )}
                  </button>
                </div>
              </div>

              {/* Transcript scroll area */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((msg, idx) => {
                  const isCandidate = msg.role === 'candidate';
                  return (
                    <div
                      key={idx}
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
                          'max-w-[88%] px-4 py-2.5 text-sm leading-relaxed',
                          isCandidate
                            ? // You: ember-tinted, right-aligned, medium weight.
                              'whitespace-pre-wrap border border-primary/40 bg-primary/15 font-medium text-foreground'
                            : msg.assist
                              ? // Autonomous intervention: ember left-accent.
                                'border-l-2 border-primary bg-primary/5 font-normal text-foreground'
                              : // Interviewer: neutral bordered card, prose weight — distinct from
                                // both the panel and the candidate bubble.
                                'border border-border bg-surface-200 font-normal text-foreground',
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
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-card px-4 py-2.5 text-sm font-medium italic text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Thinking…
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
