'use client';

import { PanelLeftClose } from 'lucide-react';
import { MarkdownMessage } from '@/components/interview/markdown-message';
import type { PublicProblem } from '@/lib/api';

/**
 * ProblemDock — the coding problem as a first-class docked panel beside the editor (LeetCode/
 * CoderPad split): statement + examples + constraints always visible while coding, resizable via
 * the parent ResizablePanel, collapsible to a slim rail. Hidden tests NEVER reach this component
 * (the backend strips them before /coding-problem responds).
 */
interface ProblemDockProps {
  problem: PublicProblem;
  /** Elapsed MM:SS on this problem (soft pacing clock — only the interview cap hard-stops). */
  clock: string;
  /** True once the soft per-problem budget is exceeded — the clock shifts to the accent color. */
  overBudget: boolean;
  onCollapseAction: () => void;
}

export function ProblemDock({ problem, clock, overBudget, onCollapseAction }: ProblemDockProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card" data-testid="problem-panel">
      {/* Header — mirrors the chat pane's h-10 header so the two docks read as siblings. */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary">
          Problem
        </span>
        <span
          data-testid="problem-title"
          className="truncate text-xs font-semibold text-foreground"
        >
          {problem.title}
        </span>
        <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
          {problem.difficulty}
        </span>
        <button
          type="button"
          onClick={onCollapseAction}
          aria-label="Collapse problem panel"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Statement — the scrollable read surface. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-foreground">
        <MarkdownMessage text={problem.statement} />
        {problem.examples.length > 0 && (
          <div className="mt-3 space-y-2">
            {problem.examples.map((ex, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-surface-deep p-2 font-mono text-[11px]"
              >
                <div className="text-muted-foreground">Input</div>
                <pre className="whitespace-pre-wrap break-all text-foreground">{ex.input}</pre>
                <div className="mt-1 text-muted-foreground">Output</div>
                <pre className="whitespace-pre-wrap break-all text-foreground">{ex.output}</pre>
                {ex.explanation && (
                  <div className="mt-1 text-muted-foreground">{ex.explanation}</div>
                )}
              </div>
            ))}
          </div>
        )}
        {problem.constraints && (
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-semibold">Constraints:</span> {problem.constraints}
          </p>
        )}
      </div>

      {/* Footer — the soft per-problem pacing clock (moved from the old chat-pane header). */}
      <div className="flex h-7 shrink-0 items-center border-t border-border px-3 font-mono text-[10px]">
        <span
          className={overBudget ? 'text-primary' : 'text-muted-foreground'}
          title="Suggested time for this problem (soft — only the overall interview limit hard-stops you)"
        >
          {clock} / 15:00
        </span>
      </div>
    </div>
  );
}
