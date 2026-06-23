'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type BadgeIntent } from '@/components/ds/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { type Scorecard } from '@/lib/api';
import { InfoTooltip } from '@/components/ds/info-tooltip';
import { AlertCircle, BarChart2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScorecardDialogProps {
  interviewId: string;
  scorecard: Scorecard;
  candidateName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RECOMMENDATION_INTENT: Record<Scorecard['recommendation'], BadgeIntent> = {
  strong_hire: 'success',
  hire: 'info',
  lean_hire: 'neutral',
  no_hire: 'danger',
};

const RECOMMENDATION_LABELS: Record<Scorecard['recommendation'], string> = {
  strong_hire: 'Strong Hire',
  hire: 'Hire',
  lean_hire: 'Lean Hire',
  no_hire: 'No Hire',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 5) * 100));
  const colorClass = score >= 4 ? 'bg-success' : score >= 3 ? 'bg-primary' : 'bg-destructive';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-6 text-right tabular-nums">
        {score}/5
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScorecardDialog({ scorecard, candidateName }: ScorecardDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent gap-1.5"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Scorecard
        </Button>
      </DialogTrigger>

      <DialogContent
        // Don't auto-focus the first control on open — that's the info (ⓘ) button, and a
        // focused Radix tooltip would pop open "by default". Tooltips now show on hover/intent.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Size to content so the whole scorecard is visible at a glance — no scroll in normal
        // use. The 95vh cap + body scroll is only a last-resort guard so an unusually long card
        // on a short screen can't render off-screen (it won't trigger for typical scorecards).
        className="flex max-h-[95vh] flex-col overflow-hidden border border-border bg-card text-card-foreground sm:max-w-lg"
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-4 pr-6">
            <div className="space-y-0.5">
              <DialogTitle className="text-foreground text-base">Interview scorecard</DialogTitle>
              {candidateName && <p className="text-xs text-muted-foreground">{candidateName}</p>}
            </div>
            {scorecard.incomplete ? (
              <StatusBadge intent="warning" className="shrink-0 gap-1">
                <AlertCircle className="h-3 w-3" />
                Incomplete
              </StatusBadge>
            ) : scorecard.scoringFailed ? (
              <StatusBadge intent="warning" className="shrink-0 gap-1">
                <AlertCircle className="h-3 w-3" />
                Manual review
              </StatusBadge>
            ) : (
              <StatusBadge
                intent={RECOMMENDATION_INTENT[scorecard.recommendation]}
                className="shrink-0"
              >
                {RECOMMENDATION_LABELS[scorecard.recommendation]}
              </StatusBadge>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pt-1">
          {/* Overall score */}
          <div className="bg-muted border border-border rounded-md px-4 py-3 flex items-center justify-between gap-3">
            <InfoTooltip
              label="Overall score"
              tip="Weighted average of all dimension scores, on a 1–5 scale."
              className="text-muted-foreground"
            />
            {scorecard.incomplete ? (
              <span className="text-right text-xs text-muted-foreground">
                Interview incomplete — partial result, not a final verdict.
              </span>
            ) : scorecard.scoringFailed ? (
              <span className="text-right text-xs text-muted-foreground">
                Automatic scoring failed — review the transcript manually.
              </span>
            ) : (
              <span className="text-2xl font-semibold text-foreground tabular-nums">
                {scorecard.overall}
                <span className="text-base font-normal text-muted-foreground">/5</span>
              </span>
            )}
          </div>

          {scorecard.timeLimited && !scorecard.incomplete && (
            <p className="-mt-3 text-xs text-muted-foreground">
              Concluded at the time limit — graded on the work completed.
            </p>
          )}

          {/* Dimensions */}
          {scorecard.dimensions.length > 0 && (
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Dimensions
              </p>
              <ul className="space-y-3">
                {scorecard.dimensions.map((dim, idx) => (
                  <li key={idx} className="space-y-1">
                    <span className="text-sm text-foreground">{dim.name}</span>
                    <ScoreBar score={dim.score} />
                    {dim.notes && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{dim.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {scorecard.summary && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Summary
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{scorecard.summary}</p>
            </div>
          )}

          <Button
            onClick={() => setOpen(false)}
            variant="outline"
            className="w-full h-9 border-border text-muted-foreground hover:text-foreground hover:bg-accent text-sm"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
