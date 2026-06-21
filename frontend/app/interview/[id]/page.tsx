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
import { AlertCircle, Play, Send, Loader2, CheckCircle } from 'lucide-react';
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
        <PhaseBadge phase={phase} />
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
          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden bg-background">
              {/* Code toolbar — language selector + Run pill */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
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
                  disabled={running}
                  className="h-7 px-4 text-xs rounded-md bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-ring gap-1.5 font-mono"
                  variant="outline"
                >
                  {running ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  RUN
                </Button>
              </div>

              {/* Editor — fills remaining vertical space */}
              <div className="flex-1 overflow-hidden">
                <EnhancedCodeMirrorEditor
                  value={code}
                  onCodeChangeAction={setCode}
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
            </div>
          </ResizablePanel>

          {/* 1px crisp divider */}
          <ResizableHandle withHandle className={isMobile ? 'h-px bg-border' : 'w-px bg-border'} />

          {/* RIGHT — AI chat / oral widget */}
          <ResizablePanel defaultSize={45} minSize={25}>
            <div className="h-full flex flex-col bg-card overflow-hidden">
              {/* Pane label */}
              <div className="shrink-0 px-4 py-2 border-b border-border">
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  INTERVIEWER
                </span>
              </div>

              {/* Transcript scroll area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={[
                        'max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                        msg.role === 'ai'
                          ? 'bg-muted text-foreground rounded-tl-sm'
                          : 'bg-primary/15 border border-primary/25 text-foreground rounded-tr-sm',
                      ].join(' ')}
                    >
                      <p
                        className={`text-[10px] font-mono font-medium mb-1 uppercase tracking-wider ${msg.role === 'ai' ? 'text-muted-foreground' : 'text-primary'}`}
                      >
                        {msg.role === 'ai' ? 'Interviewer' : 'You'}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}

                {aiThinking && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-muted-foreground italic flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      Thinking…
                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />
              </div>

              {/* Answer input area */}
              <div className="shrink-0 border-t border-border p-3">
                <div className="flex gap-2">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={handleAnswerKeyDown}
                    disabled={aiThinking}
                    placeholder="Type your answer… (Ctrl+Enter to send)"
                    rows={3}
                    className="flex-1 resize-none rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground/50 text-sm px-3 py-2 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-ring disabled:opacity-50 transition-colors font-sans"
                  />
                  <Button
                    onClick={handleSendAnswer}
                    disabled={aiThinking || !answer.trim()}
                    className="self-end h-9 w-9 p-0 rounded-md bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50"
                    size="icon"
                    aria-label="Send answer"
                  >
                    {aiThinking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
