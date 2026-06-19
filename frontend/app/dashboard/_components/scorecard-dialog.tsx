"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type Scorecard } from "@/lib/api";
import { BarChart2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScorecardDialogProps {
  interviewId: string;
  scorecard: Scorecard;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RECOMMENDATION_STYLES: Record<Scorecard["recommendation"], string> = {
  strong_hire: "border-[#34D399]/40 text-[#34D399] bg-[#34D399]/10",
  hire: "border-[#2F6BFF]/40 text-[#2F6BFF] bg-[#2F6BFF]/10",
  lean_hire: "border-[#2F6BFF]/30 text-[#9AA1AC] bg-[#2F6BFF]/5",
  no_hire: "border-[#F2555A]/40 text-[#F2555A] bg-[#F2555A]/10",
};

const RECOMMENDATION_LABELS: Record<Scorecard["recommendation"], string> = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  lean_hire: "Lean Hire",
  no_hire: "No Hire",
};

function ScoreBar({ score }: { score: number }) {
  // score is 0–5
  const pct = Math.min(100, Math.max(0, (score / 5) * 100));
  const color =
    score >= 4 ? "#34D399" : score >= 3 ? "#2F6BFF" : "#F2555A";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#1C1F25] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono text-[#9AA1AC] w-6 text-right">
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
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs border-[#2A2E37] bg-transparent text-[#9AA1AC] hover:text-[#EAECEF] hover:bg-[#1C1F25] gap-1.5 focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Scorecard
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-[#141619] border border-[#2A2E37] text-[#EAECEF] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-6">
            <DialogTitle className="text-[#EAECEF] text-base">
              Interview scorecard
            </DialogTitle>
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
          <div className="bg-[#1C1F25] border border-[#2A2E37] rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-[#9AA1AC]">Overall score</span>
            <span className="text-2xl font-semibold text-[#EAECEF]">
              {scorecard.overall}
              <span className="text-base font-normal text-[#9AA1AC]">/5</span>
            </span>
          </div>

          {/* Dimensions */}
          {scorecard.dimensions.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-[#9AA1AC] font-medium">
                Dimensions
              </p>
              <ul className="space-y-3">
                {scorecard.dimensions.map((dim, idx) => (
                  <li key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#EAECEF]">{dim.name}</span>
                    </div>
                    <ScoreBar score={dim.score} />
                    {dim.notes && (
                      <p className="text-xs text-[#9AA1AC] leading-relaxed pl-0">
                        {dim.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {scorecard.summary && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-[#9AA1AC] font-medium">
                Summary
              </p>
              <p className="text-sm text-[#9AA1AC] leading-relaxed">
                {scorecard.summary}
              </p>
            </div>
          )}

          <Button
            onClick={() => setOpen(false)}
            className="w-full h-9 bg-[#1C1F25] hover:bg-[#2A2E37] text-[#EAECEF] text-sm border border-[#2A2E37] focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
