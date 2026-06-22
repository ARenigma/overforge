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
import { cancelInterview, deleteInterview } from '@/lib/api';

// States from which a soft-cancel is meaningless (already terminal).
const TERMINAL = new Set(['scored', 'cancelled', 'expired', 'abandoned']);

export function InterviewRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const cancellable = !TERMINAL.has(status);

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
    await cancelInterview(await accessToken(), id);
    router.refresh();
  }

  async function doDelete() {
    await deleteInterview(await accessToken(), id);
    router.refresh();
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
        <DropdownMenuContent align="end" className="w-48">
          {cancellable && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCancelOpen(true);
              }}
            >
              Cancel interview
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
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
