'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ds/confirm-dialog';
import { TextConfirmDialog } from '@/components/ds/text-confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { cancelInterview, deleteInterview, rescoreInterview } from '@/lib/api';
import { toast } from 'sonner';

// States from which a soft-cancel is meaningless (already terminal).
const TERMINAL = new Set(['scored', 'cancelled', 'expired', 'abandoned']);
// States the backend allows re-scoring (orchestrator.rescore): a finished or stuck-mid-score
// interview only. NOT abandoned/expired (incomplete) or in_progress (live).
const RESCORABLE = new Set(['scored', 'completed']);

export function InterviewRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rescoreOpen, setRescoreOpen] = useState(false);

  const cancellable = !TERMINAL.has(status);
  const rescorable = RESCORABLE.has(status);

  async function accessToken(): Promise<string> {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return session.access_token;
  }

  async function doCancel() {
    try {
      await cancelInterview(await accessToken(), id);
      router.refresh();
      toast.success('Interview cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel interview');
    }
  }

  async function doDelete() {
    try {
      await deleteInterview(await accessToken(), id);
      router.refresh();
      toast.success('Interview deleted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete interview');
    }
  }

  async function doRescore() {
    try {
      await rescoreInterview(await accessToken(), id);
      router.refresh();
      toast.success('Re-scoring started — scorecard will update shortly');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to start re-scoring');
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Interview actions"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Radix returns focus to the trigger when the menu (or a dialog it opens) closes.
            After a pointer-driven close, Chromium's :focus-visible heuristic treats that
            programmatic refocus as keyboard-like and paints a lingering green ring on the ⋯
            button. Dropping the auto-refocus removes the stray highlight; keyboard users
            simply Tab onward from where they were. */}
        <DropdownMenuContent
          align="end"
          className="w-48"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {cancellable && (
            <DropdownMenuItem onSelect={() => setTimeout(() => setCancelOpen(true), 0)}>
              Cancel interview
            </DropdownMenuItem>
          )}
          {rescorable && (
            <DropdownMenuItem onSelect={() => setTimeout(() => setRescoreOpen(true), 0)}>
              Re-score
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setTimeout(() => setDeleteOpen(true), 0)}
            className="text-destructive focus:text-destructive"
          >
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this interview?"
        description="The candidate's invite link will stop working. The record is kept for your reference."
        confirmLabel="Cancel interview"
        destructive
        onConfirm={doCancel}
      />
      <ConfirmDialog
        open={rescoreOpen}
        onOpenChange={setRescoreOpen}
        title="Re-score this interview?"
        description="This re-runs the AI grader over the transcript and code, overwrites any existing scorecard, and emails the result."
        confirmLabel="Re-score"
        onConfirm={doRescore}
      />
      <TextConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this interview?"
        description="This permanently removes the interview, its transcript, and any scorecard. This cannot be undone."
        confirmPhrase="delete"
        confirmLabel="Delete permanently"
        onConfirm={doDelete}
      />
    </>
  );
}
