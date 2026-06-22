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
 * variant that gates the destructive action behind typing an exact phrase (case-sensitive).
 * Works trigger-driven (pass `trigger`) or controlled (pass `open` + `onOpenChange`).
 */
export function TextConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel = 'I understand, continue',
  cancelLabel = 'Cancel',
  onConfirm,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmPhrase: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const matches = value === confirmPhrase;

  function applyOpen(v: boolean) {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  }

  function setOpen(v: boolean) {
    if (loading) return;
    applyOpen(v);
    if (!v) setValue('');
  }

  async function handleConfirm() {
    if (!matches) return;
    try {
      setLoading(true);
      await onConfirm();
      applyOpen(false);
      setValue('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
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
