"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedCodeMirrorEditor } from "@/components/enhanced-code-mirror-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  beginInterview,
  answerInterview,
  runCode as apiRunCode,
  finishInterview,
  type InterviewPhase,
  type RunResult,
} from "@/lib/api";
import { AlertCircle, Play, Send, Loader2, CheckCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = "loading_token" | "consent" | "interview" | "done" | "error";

interface Message {
  role: "ai" | "candidate";
  text: string;
}

const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
] as const;

type Language = (typeof LANGUAGES)[number]["value"];

const PHASE_LABELS: Record<InterviewPhase, string> = {
  greeting: "Greeting",
  oral: "Oral Q&A",
  handoff: "Transition",
  coding: "Coding",
  wrap_up: "Wrap-up",
  done: "Done",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#0A0B0D] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#141619] border border-[#F2555A]/40 rounded-xl p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-[#F2555A] mx-auto" />
        <h2 className="text-base font-semibold text-[#EAECEF]">Something went wrong</h2>
        <p className="text-sm text-[#9AA1AC]">{message}</p>
      </div>
    </div>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="min-h-screen bg-[#0A0B0D] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-[#2F6BFF] animate-spin" />
        <p className="text-sm text-[#9AA1AC]">{text}</p>
      </div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: InterviewPhase }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] uppercase tracking-widest border-[#2F6BFF]/40 text-[#2F6BFF] bg-[#2F6BFF]/10 px-2 py-0.5"
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
  const token = searchParams.get("t");

  const [stage, setStage] = useState<Stage>(token ? "consent" : "error");
  const [errorMsg, setErrorMsg] = useState<string>(
    token ? "" : "Invalid or missing interview link."
  );

  // Interview state
  const [phase, setPhase] = useState<InterviewPhase>("greeting");
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  // Code pane
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Answer textarea
  const [answer, setAnswer] = useState("");

  // Whether /finish has been called (idempotent guard)
  const finishCalledRef = useRef(false);

  // Transcript scroll ref
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiThinking]);

  // Auto-call /finish when phase reaches done
  useEffect(() => {
    if (phase === "done" && !finishCalledRef.current && token) {
      finishCalledRef.current = true;
      finishInterview(id, token).catch(() => {
        // Idempotent — ignore errors silently
      });
    }
  }, [phase, id, token]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleBegin() {
    if (!token) return;
    setStage("loading_token");
    try {
      const res = await beginInterview(id, token);
      setPhase(res.phase);
      setMessages([{ role: "ai", text: res.utterance.text }]);
      if (res.phase === "done") {
        setStage("done");
      } else {
        setStage("interview");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start interview.");
      setStage("error");
    }
  }

  async function handleSendAnswer() {
    if (!token || !answer.trim() || aiThinking) return;
    const text = answer.trim();
    setAnswer("");
    setMessages((prev) => [...prev, { role: "candidate", text }]);
    setAiThinking(true);
    try {
      const res = await answerInterview(id, token, text);
      setPhase(res.phase);
      setMessages((prev) => [...prev, { role: "ai", text: res.utterance.text }]);
      if (res.phase === "done") {
        setStage("done");
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: `Error: ${err instanceof Error ? err.message : "Failed to send answer. Please try again."}`,
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
      setRunError(err instanceof Error ? err.message : "Code execution failed.");
    } finally {
      setRunning(false);
    }
  }, [id, token, language, code, running]);

  function handleAnswerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendAnswer();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (stage === "error") {
    return <ErrorCard message={errorMsg} />;
  }

  if (stage === "loading_token") {
    return <LoadingScreen text="Starting your interview…" />;
  }

  // STAGE 1 — Consent
  if (stage === "consent") {
    return (
      <div className="min-h-screen bg-[#0A0B0D] flex items-center justify-center px-4">
        <div className="w-full max-w-lg bg-[#141619] border border-[#2A2E37] rounded-xl p-8 space-y-6">
          {/* Logo */}
          <div className="text-center">
            <span className="text-xl font-medium text-[#EAECEF]">Over</span>
            <span className="text-xl font-bold text-[#2F6BFF]">Forge</span>
            <p className="text-sm text-[#9AA1AC] mt-1">Technical Interview Platform</p>
          </div>

          {/* T&C notice */}
          <div className="bg-[#1C1F25] border border-[#2A2E37] rounded-lg p-4 space-y-3 text-sm text-[#9AA1AC] leading-relaxed">
            <p className="font-medium text-[#EAECEF]">Before you begin</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>This session is being recorded for evaluation purposes.</li>
              <li>Your responses will be assessed by an AI interviewer.</li>
              <li>Do not share your session link with others.</li>
              <li>
                Attempting to use unauthorized resources may affect your evaluation.
              </li>
            </ul>
            <p>
              By clicking <strong className="text-[#EAECEF]">I agree &amp; start</strong>, you
              confirm that you have read and accepted these terms.
            </p>
          </div>

          <Button
            onClick={handleBegin}
            className="w-full h-10 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white font-medium focus-visible:ring-2 focus-visible:ring-[#2F6BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141619]"
          >
            I agree &amp; start
          </Button>
        </div>
      </div>
    );
  }

  // STAGE 2 — Interview (split-pane) + Done state
  const isDone = stage === "done" || phase === "done";

  return (
    <div className="h-screen bg-[#0A0B0D] text-[#EAECEF] flex flex-col overflow-hidden">
      {/* Thin top bar */}
      <header className="h-11 border-b border-[#2A2E37] bg-[#141619] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#EAECEF]">Over</span>
          <span className="text-sm font-bold text-[#2F6BFF] -ml-1.5">Forge</span>
        </div>
        <PhaseBadge phase={phase} />
      </header>

      {isDone ? (
        // Done state — full-width thank-you
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-[#141619] border border-[#34D399]/40 rounded-xl p-8 text-center space-y-4">
            <CheckCircle className="w-10 h-10 text-[#34D399] mx-auto" />
            <h2 className="text-base font-semibold text-[#EAECEF]">Interview complete</h2>
            <p className="text-sm text-[#9AA1AC]">
              Thank you for completing this interview. Your responses have been submitted
              and will be reviewed shortly.
            </p>
          </div>
        </div>
      ) : (
        // Split-pane interview layout
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {/* LEFT — code pane */}
          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden bg-[#0A0B0D]">
              {/* Code toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2A2E37] bg-[#141619] shrink-0">
                <Select
                  value={language}
                  onValueChange={(v) => setLanguage(v as Language)}
                >
                  <SelectTrigger className="h-7 w-36 text-xs bg-[#1C1F25] border-[#2A2E37] text-[#EAECEF] focus:ring-[#2F6BFF]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1C1F25] border-[#2A2E37] text-[#EAECEF]">
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value} className="text-xs focus:bg-[#2A2E37]">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  onClick={handleRunCode}
                  disabled={running}
                  className="h-7 px-3 text-xs bg-[#34D399]/10 border border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/20 focus-visible:ring-[#34D399] gap-1.5"
                  variant="outline"
                >
                  {running ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run
                </Button>
              </div>

              {/* Editor (takes remaining vertical space) */}
              <div className="flex-1 overflow-hidden">
                <EnhancedCodeMirrorEditor
                  value={code}
                  onCodeChangeAction={setCode}
                  language={language}
                  onExecuteAction={handleRunCode}
                  isExecuting={running}
                />
              </div>

              {/* Terminal output */}
              <div className="shrink-0 h-[160px] border-t border-[#2A2E37] bg-[#0A0B0D] overflow-auto p-3 font-mono text-[11px]">
                {runError && (
                  <Alert className="mb-2 border-[#F2555A]/40 bg-[#F2555A]/10 py-2 px-3">
                    <AlertDescription className="text-[#F2555A] text-xs">{runError}</AlertDescription>
                  </Alert>
                )}
                {runResult ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-[#9AA1AC] text-[10px] uppercase tracking-wider">
                      <span
                        className={
                          runResult.exitCode === 0 ? "text-[#34D399]" : "text-[#F2555A]"
                        }
                      >
                        {runResult.status}
                      </span>
                      <span>{runResult.timeMs}ms</span>
                      <span>{Math.round(runResult.memoryKb / 1024)}KB</span>
                    </div>
                    {runResult.compileOutput && (
                      <pre className="text-[#F2555A] whitespace-pre-wrap break-all">
                        {runResult.compileOutput}
                      </pre>
                    )}
                    {runResult.stdout && (
                      <pre className="text-[#EAECEF] whitespace-pre-wrap break-all">
                        {runResult.stdout}
                      </pre>
                    )}
                    {runResult.stderr && (
                      <pre className="text-[#F2555A] whitespace-pre-wrap break-all">
                        {runResult.stderr}
                      </pre>
                    )}
                    {!runResult.stdout && !runResult.stderr && !runResult.compileOutput && (
                      <span className="text-[#9AA1AC]">(no output)</span>
                    )}
                  </div>
                ) : (
                  !runError && (
                    <span className="text-[#9AA1AC]">Run your code to see output here.</span>
                  )
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-[#2A2E37] w-px" />

          {/* RIGHT — comms panel */}
          <ResizablePanel defaultSize={45} minSize={25}>
            <div className="h-full flex flex-col bg-[#141619] overflow-hidden">
              {/* Transcript */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "candidate" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                        msg.role === "ai"
                          ? "bg-[#1C1F25] text-[#EAECEF] rounded-tl-sm"
                          : "bg-[#2F6BFF]/20 border border-[#2F6BFF]/30 text-[#EAECEF] rounded-tr-sm",
                      ].join(" ")}
                    >
                      <p className={`text-[10px] font-medium mb-1 uppercase tracking-wider ${msg.role === "ai" ? "text-[#9AA1AC]" : "text-[#2F6BFF]"}`}>
                        {msg.role === "ai" ? "Interviewer" : "You"}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}

                {aiThinking && (
                  <div className="flex justify-start">
                    <div className="bg-[#1C1F25] rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-[#9AA1AC] italic">
                      Thinking…
                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />
              </div>

              {/* Input area */}
              <div className="shrink-0 border-t border-[#2A2E37] p-3">
                <div className="flex gap-2">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={handleAnswerKeyDown}
                    disabled={aiThinking}
                    placeholder="Type your answer… (Ctrl+Enter to send)"
                    rows={3}
                    className="flex-1 resize-none rounded-lg bg-[#1C1F25] border border-[#2A2E37] text-[#EAECEF] placeholder:text-[#9AA1AC]/50 text-sm px-3 py-2 focus:outline-none focus:border-[#2F6BFF] focus:ring-1 focus:ring-[#2F6BFF] disabled:opacity-50 transition-colors"
                  />
                  <Button
                    onClick={handleSendAnswer}
                    disabled={aiThinking || !answer.trim()}
                    className="self-end h-9 px-3 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white focus-visible:ring-2 focus-visible:ring-[#2F6BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141619] disabled:opacity-50"
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
