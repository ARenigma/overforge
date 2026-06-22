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
import { EnhancedCodeMirrorEditor } from '@/components/enhanced-code-mirror-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  beginInterview,
  answerInterview,
  runCode as apiRunCode,
  finishInterview,
  type InterviewPhase,
  type RunResult,
} from '@/lib/api';
import { AlertCircle, ArrowUp, CheckCircle, Clock, Loader2, Play } from 'lucide-react';
import { Wordmark } from '@/components/marketing/wordmark';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'loading_token' | 'consent' | 'interview' | 'done' | 'error';

interface Message {
  role: 'ai' | 'candidate';
  text: string;
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
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
  const token = searchParams.get('t');

  const [stage, setStage] = useState<Stage>(token ? 'consent' : 'error');
  const [errorMsg, setErrorMsg] = useState<string>(
    token ? '' : 'Invalid or missing interview link.'
  );

  // Interview state
  const [phase, setPhase] = useState<InterviewPhase>('greeting');
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  // Code pane
  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Answer textarea
  const [answer, setAnswer] = useState('');

  // Responsive: stack the split-pane vertically on small screens
  const [isMobile, setIsMobile] = useState(false);

  // Elapsed session timer (count-up) + live editor cursor position
  const [elapsed, setElapsed] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // Whether /finish has been called (idempotent guard)
  const finishCalledRef = useRef(false);

  // Transcript scroll ref
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-call /finish when phase reaches done
  useEffect(() => {
    if (phase === 'done' && !finishCalledRef.current && token) {
      finishCalledRef.current = true;
      finishInterview(id, token).catch(() => {
        // Idempotent — ignore errors silently
      });
    }
  }, [phase, id, token]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleBegin() {
    if (!token) return;
    setStage('loading_token');
    try {
      const res = await beginInterview(id, token);
      setPhase(res.phase);
      setMessages([{ role: 'ai', text: res.utterance.text }]);
      if (res.phase === 'done') {
        setStage('done');
      } else {
        setStage('interview');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start interview.');
      setStage('error');
    }
  }

  async function handleSendAnswer() {
    if (!token || !answer.trim() || aiThinking) return;
    const text = answer.trim();
    setAnswer('');
    setMessages((prev) => [...prev, { role: 'candidate', text }]);
    setAiThinking(true);
    try {
      const res = await answerInterview(id, token, text);
      setPhase(res.phase);
      setMessages((prev) => [...prev, { role: 'ai', text: res.utterance.text }]);
      if (res.phase === 'done') {
        setStage('done');
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Error: ${err instanceof Error ? err.message : 'Failed to send answer. Please try again.'}`,
        },
      ]);
    } finally {
      setAiThinking(false);
    }
  }

  const handleRunCode = useCallback(async () => {
    if (!token || running) return;
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const result = await apiRunCode(id, token, language, code);
      setRunResult(result);
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'Code execution failed.');
    } finally {
      setRunning(false);
    }
  }, [id, token, language, code, running]);

  function handleAnswerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
            </ul>
            <p>
              By clicking <strong className="text-foreground">I agree &amp; start</strong>, you
              confirm that you have read and accepted these terms.
            </p>
          </div>

          <Button
            onClick={handleBegin}
            className="w-full h-11 rounded-md bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            I agree &amp; start
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
      {/* Minimal top strip */}
      <header className="h-11 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <Wordmark className="scale-90 origin-left" />
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
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
            <h2 className="text-base font-medium text-foreground">Interview complete</h2>
            <p className="text-sm text-muted-foreground">
              Thank you for completing this interview. Your responses have been submitted and will
              be reviewed shortly.
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
                <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <SelectTrigger className="h-7 w-36 text-xs bg-muted border-border text-foreground focus:ring-ring font-mono">
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
                      <span>{runResult.timeMs}ms</span>
                      <span>{Math.round(runResult.memoryKb / 1024)}KB</span>
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
                <span className="text-muted-foreground/40">·</span>
                <span className="capitalize">{language}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>Spaces: 4</span>
                <span className="ml-auto">UTF-8</span>
              </div>
            </div>
          </ResizablePanel>

          {/* 1px crisp divider */}
          <ResizableHandle withHandle className={isMobile ? 'h-px bg-border' : 'w-px bg-border'} />

          {/* RIGHT — AI chat / oral widget */}
          <ResizablePanel defaultSize={38} minSize={25}>
            <div className="flex h-full flex-col overflow-hidden bg-[hsl(var(--surface-deep))]">
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
              </div>

              {/* Transcript scroll area */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={[
                        'max-w-[88%] whitespace-pre-wrap px-4 py-2.5 text-sm font-semibold leading-relaxed',
                        msg.role === 'ai'
                          ? 'bg-card text-foreground'
                          : 'border border-primary/30 bg-primary/15 text-foreground',
                      ].join(' ')}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

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
                <div className="relative border border-border bg-background transition-colors focus-within:border-muted-foreground/40">
                  <textarea
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={handleAnswerKeyDown}
                    disabled={aiThinking}
                    placeholder="Type your answer…"
                    rows={1}
                    className="block max-h-40 min-h-[3rem] w-full resize-none bg-transparent px-3 py-3 pr-14 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleSendAnswer}
                    disabled={aiThinking || !answer.trim()}
                    aria-label="Send answer"
                    className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
                  >
                    {aiThinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 px-0.5 text-[10px] text-muted-foreground/60">
                  <kbd className="border border-border bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground">
                    ⌘ ↵
                  </kbd>{' '}
                  to send
                </p>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
