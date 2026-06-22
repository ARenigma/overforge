'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Text-Confirm Dialog fragment (Supabase design-system "Text Confirm Modal"): a high-risk
 * variant that gates the destructive action behind typing an exact phrase. Case-sensitive,
 * matching the Supabase precedent.
 */
export function TextConfirmDialog({
  trigger,
  title,
  description,
  confirmPhrase,
  confirmLabel = 'I understand, continue',
  cancelLabel = 'Cancel',
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmPhrase: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');

  const matches = value === confirmPhrase;

  function reset() {
    setValue('');
    setLoading(false);
  }

  async function handleConfirm() {
    if (!matches) return;
    try {
      setLoading(true);
      await onConfirm();
      setOpen(false);
      reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return;
        setOpen(v);
        if (!v) reset();
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="border border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base text-foreground">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{confirmPhrase}</span> to
            confirm.
          </p>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="off"
            aria-label={`Type ${confirmPhrase} to confirm`}
            className="h-9"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={loading}
            disabled={!matches}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
