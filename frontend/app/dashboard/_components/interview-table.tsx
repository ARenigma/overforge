'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScorecardDialog } from './scorecard-dialog';
import { FilterBar } from './filter-bar';
import { EmptyState, ErrorState } from '@/components/ds/state-block';
import { CalendarClock, SearchX } from 'lucide-react';
import { type Scorecard } from '@/lib/api';

export interface InterviewRow {
  id: string;
  candidate_email: string | null;
  status: string;
  created_at: string;
  evaluation_score: Scorecard | null;
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, string> = {
  pending: 'border-border text-muted-foreground bg-transparent',
  active: 'border-primary/40 text-primary bg-primary/10',
  completed: 'border-success/40 text-success bg-success/10',
  scored: 'border-success/40 text-success bg-success/10',
  cancelled: 'border-destructive/40 text-destructive bg-destructive/10',
};

function statusVariant(status: string) {
  return (
    STATUS_VARIANT[status.toLowerCase()] ?? 'border-border text-muted-foreground bg-transparent'
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? 'border-success/40 text-success bg-success/10'
      : score >= 3
        ? 'border-primary/40 text-primary bg-primary/10'
        : 'border-destructive/40 text-destructive bg-destructive/10';

  return (
    <Badge variant="outline" className={`font-mono text-[11px] ${color}`}>
      {score}/5
    </Badge>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

export function InterviewTable({
  rows,
  error,
}: {
  rows: InterviewRow[];
  error: { message: string } | null;
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // A failed fetch short-circuits before the filter bar — nothing to filter.
  if (error) {
    return (
      <ErrorState
        title="Couldn't load your interviews"
        description="Something went wrong fetching your sessions. Refresh the page to try again."
      />
    );
  }

  // First-run empty state (no interviews at all) — distinct from "no matches".
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-8 w-8" />}
        title="No interviews yet"
        description="Create your first session and share the link with a candidate."
      />
    );
  }

  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status.toLowerCase() === statusFilter;
    const matchesSearch = !q || (r.candidate_email?.toLowerCase().includes(q) ?? false);
    return matchesStatus && matchesSearch;
  });

  function clearFilters() {
    setStatusFilter('all');
    setSearch('');
  }

  return (
    <div className="space-y-4">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-8 w-8" />}
          title="No interviews match your filters"
          description="Try a different status or search term."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  Candidate
                </th>
                <th
                  scope="col"
                  className="hidden px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground sm:table-cell"
                >
                  Created
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((interview) => (
                <tr
                  key={interview.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-accent/50"
                >
                  {/* Candidate (+ date on mobile, where the Created column is hidden) */}
                  <td className="px-5 py-3.5 align-middle">
                    <span className="block truncate text-sm text-foreground">
                      {interview.candidate_email ?? (
                        <span className="italic text-muted-foreground">No candidate yet</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground sm:hidden">
                      {formatDate(interview.created_at)}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="hidden px-5 py-3.5 align-middle text-sm tabular-nums text-muted-foreground sm:table-cell">
                    {formatDate(interview.created_at)}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5 align-middle">
                    <Badge
                      variant="outline"
                      className={`w-fit text-xs capitalize ${statusVariant(interview.status)}`}
                    >
                      {interview.status}
                    </Badge>
                  </td>

                  {/* Score / scorecard trigger */}
                  <td className="px-5 py-3.5 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      {interview.evaluation_score ? (
                        <>
                          <ScoreBadge score={interview.evaluation_score.overall} />
                          <ScorecardDialog
                            interviewId={interview.id}
                            scorecard={interview.evaluation_score}
                          />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
