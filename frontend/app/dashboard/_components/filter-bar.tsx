import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

// Mirrors the backend interview_status enum (the transient 'completed' state is omitted).
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'scored', label: 'Scored' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
  { value: 'abandoned', label: 'Abandoned' },
];

/**
 * Filter Bar fragment (Supabase design-system "Filter Bar"): a search input + a status
 * Select. Controlled — the parent owns the filter state and applies it client-side.
 */
export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
}) {
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search by candidate name or email"
          className="h-11 pl-10 text-sm"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
