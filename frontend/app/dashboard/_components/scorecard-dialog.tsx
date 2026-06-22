'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { type Scorecard } from '@/lib/api';
import { InfoTooltip } from '@/components/ds/info-tooltip';
import { BarChart2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScorecardDialogProps {
  interviewId: string;
  scorecard: Scorecard;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RECOMMENDATION_STYLES: Record<Scorecard['recommendation'], string> = {
  strong_hire: 'border-success/40 text-success bg-success/10',
  hire: 'border-primary/40 text-primary bg-primary/10',
  lean_hire: 'border-primary/30 text-muted-foreground bg-primary/5',
  no_hire: 'border-destructive/40 text-destructive bg-destructive/10',
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

export function ScorecardDialog({ scorecard }: ScorecardDialogProps) {
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

      <DialogContent className="bg-card border border-border text-card-foreground sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-6">
            <DialogTitle className="text-foreground text-base">Interview scorecard</DialogTitle>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${RECOMMENDATION_STYLES[scorecard.recommendation]}`}
            >
              {RECOMMENDATION_LABELS[scorecard.recommendation]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Overall score */}
          <div className="bg-muted border border-border rounded-md px-4 py-3 flex items-center justify-between">
            <InfoTooltip
              label="Overall score"
              tip="Weighted average of all dimension scores, on a 1–5 scale."
              className="text-muted-foreground"
            />
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {scorecard.overall}
              <span className="text-base font-normal text-muted-foreground">/5</span>
            </span>
          </div>

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
