import { type BadgeIntent } from '@/components/ds/status-badge';

/** Display label + StatusBadge intent for each backend interview_status value. */
export const STATUS_META: Record<string, { label: string; intent: BadgeIntent }> = {
  invited: { label: 'Invited', intent: 'neutral' },
  in_progress: { label: 'In progress', intent: 'info' },
  completed: { label: 'Scoring', intent: 'info' },
  scored: { label: 'Scored', intent: 'success' },
  cancelled: { label: 'Cancelled', intent: 'danger' },
  expired: { label: 'Expired', intent: 'warning' },
  abandoned: { label: 'Abandoned', intent: 'warning' },
};

export function statusMeta(status: string): { label: string; intent: BadgeIntent } {
  return STATUS_META[status.toLowerCase()] ?? { label: status, intent: 'neutral' };
}
