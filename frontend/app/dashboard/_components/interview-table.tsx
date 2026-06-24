'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScorecardDialog } from './scorecard-dialog';
import { FilterBar } from './filter-bar';
import { InterviewRowActions } from './interview-row-actions';
import { EmptyState, ErrorState } from '@/components/ds/state-block';
import { Pagination } from '@/components/ds/pagination';
import { StatusBadge, type BadgeIntent } from '@/components/ds/status-badge';
import { statusMeta } from '@/lib/interview-status';
import { AlertCircle, CalendarClock, SearchX } from 'lucide-react';
import { type Scorecard } from '@/lib/api';

const PAGE_SIZE = 20;

export interface InterviewRow {
  id: string;
  candidate_email: string | null;
  candidate_name: string | null;
  status: string;
  created_at: string;
  evaluation_score: Scorecard | null;
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
  const intent: BadgeIntent = score >= 4 ? 'success' : score >= 3 ? 'info' : 'danger';
  return (
    <StatusBadge intent={intent} className="font-mono text-[11px]">
      {score}/5
    </StatusBadge>
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
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

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
    const matchesSearch =
      !q ||
      (r.candidate_email?.toLowerCase().includes(q) ?? false) ||
      (r.candidate_name?.toLowerCase().includes(q) ?? false);
    return matchesStatus && matchesSearch;
  });

  function clearFilters() {
    setStatusFilter('all');
    setSearch('');
  }

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
                <th scope="col" className="w-10 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((interview) => (
                <tr
                  key={interview.id}
                  onClick={() => router.push(`/dashboard/${interview.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') router.push(`/dashboard/${interview.id}`);
                  }}
                  tabIndex={0}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  {/* Candidate (+ date on mobile, where the Created column is hidden) */}
                  <td className="px-5 py-3.5 align-middle">
                    {interview.candidate_name ? (
                      <>
                        <span className="block truncate text-sm text-foreground">
                          {interview.candidate_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {interview.candidate_email ?? 'No email'}
                        </span>
                      </>
                    ) : (
                      <span className="block truncate text-sm text-foreground">
                        {interview.candidate_email ?? (
                          <span className="italic text-muted-foreground">No candidate yet</span>
                        )}
                      </span>
                    )}
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
                    <StatusBadge intent={statusMeta(interview.status).intent}>
                      {statusMeta(interview.status).label}
                    </StatusBadge>
                  </td>

                  {/* Score / scorecard trigger */}
                  <td className="px-5 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {interview.evaluation_score ? (
                        <>
                          {interview.evaluation_score.incomplete ? (
                            <StatusBadge intent="warning" className="gap-1 text-[11px]">
                              <AlertCircle className="h-3 w-3" />
                              Incomplete
                            </StatusBadge>
                          ) : interview.evaluation_score.scoringFailed ? (
                            <StatusBadge intent="warning" className="gap-1 text-[11px]">
                              <AlertCircle className="h-3 w-3" />
                              Review
                            </StatusBadge>
                          ) : (
                            <ScoreBadge score={interview.evaluation_score.overall} />
                          )}
                          <ScorecardDialog
                            interviewId={interview.id}
                            scorecard={interview.evaluation_score}
                            candidateName={
                              interview.candidate_name ?? interview.candidate_email ?? undefined
                            }
                          />
                        </>
                      ) : (
                        <span className="text-xs text-foreground-ghost">—</span>
                      )}
                    </div>
                  </td>

                  {/* Row actions */}
                  <td
                    className="px-2 py-3.5 align-middle text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InterviewRowActions id={interview.id} status={interview.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
