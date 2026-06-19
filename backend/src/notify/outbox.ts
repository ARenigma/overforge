// Reliable interviewer notification via the transactional-outbox pattern.
// The scoring step writes a notify_outbox row in the same transaction as
// status='scored'; this worker drains pending rows to the email sender and marks
// them sent/failed. Idempotent (sender failure -> retry next drain) and decoupled
// from request handling. No in-DB HTTP triggers (see ARCHITECTURE_SPEC §8).

import { Scorecard } from '../scoring/types';

export interface ScorecardOutboxItem {
  id: number | string;
  interviewId: string;
  interviewerEmail: string;
  candidateEmail: string;
  candidateName?: string;
  scorecard: Scorecard;
}

export interface OutboxStore {
  claimPending(limit: number): Promise<ScorecardOutboxItem[]>;
  markSent(id: number | string): Promise<void>;
  markFailed(id: number | string, error: string): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** Pure: build the interviewer scorecard email from an interview + scorecard. */
export function buildScorecardEmail(item: ScorecardOutboxItem): EmailMessage {
  const who = item.candidateName ? `${item.candidateName} (${item.candidateEmail})` : item.candidateEmail;
  const sc = item.scorecard;
  const dims = sc.dimensions.map((d) => `  • ${d.name}: ${d.score}/5 — ${d.notes}`).join('\n');
  const text =
    `Interview complete for ${who}.\n\n` +
    `Overall: ${sc.overall}/5\n` +
    `Recommendation: ${sc.recommendation}\n\n` +
    `Dimensions:\n${dims || '  (none)'}\n\n` +
    `Summary:\n${sc.summary}\n\n` +
    `Interview ID: ${item.interviewId}`;
  const html =
    `<h2>Interview complete — ${escapeHtml(who)}</h2>` +
    `<p><strong>Overall:</strong> ${sc.overall}/5<br/>` +
    `<strong>Recommendation:</strong> ${escapeHtml(sc.recommendation)}</p>` +
    `<ul>${sc.dimensions.map((d) => `<li>${escapeHtml(d.name)}: ${d.score}/5 — ${escapeHtml(d.notes)}</li>`).join('')}</ul>` +
    `<p><strong>Summary:</strong> ${escapeHtml(sc.summary)}</p>` +
    `<p style="color:#888">Interview ID: ${escapeHtml(item.interviewId)}</p>`;
  return { to: item.interviewerEmail, subject: `Scorecard: ${who} — ${sc.recommendation}`, text, html };
}

export interface DrainResult {
  sent: number;
  failed: number;
}

/** Drain pending scorecard notifications. Each failure is isolated and retried later. */
export async function drainOutbox(
  store: OutboxStore,
  sender: EmailSender,
  opts: { limit?: number } = {}
): Promise<DrainResult> {
  const items = await store.claimPending(opts.limit ?? 25);
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await sender.send(buildScorecardEmail(item));
      await store.markSent(item.id);
      sent++;
    } catch (err) {
      await store.markFailed(item.id, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }
  return { sent, failed };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
