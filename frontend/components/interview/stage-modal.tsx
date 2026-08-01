'use client';

import { useEffect, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface StageModalProps {
  open: boolean;
  title: string;
  body: string;
  buttonLabel: string;
  onAcknowledge: () => void;
  escalationNote?: string;
}

/**
 * System-initiated blocking stage-transition announcement.
 * Stays open until the candidate explicitly acknowledges via the single button.
 *
 * Accessibility:
 * - role="alertdialog" is set by Radix; title + description are auto-announced on open.
 * - Escape and outside-click are blocked; the description declares "Press [label] to continue."
 * - escalationNote is in aria-live="polite" so it announces without re-reading the whole dialog.
 * - On open: focus moves to the acknowledge button.
 * - On close: caller returns focus to role="log" (transcript container).
 * - Zoom + slide animations are gated by motion-safe: (prefers-reduced-motion: reduce users get
 *   the fade only, per spec §1).
 */
export function StageModal({
  open,
  title,
  body,
  buttonLabel,
  onAcknowledge,
  escalationNote,
}: StageModalProps) {
  const ackRef = useRef<HTMLButtonElement>(null);

  // Move focus to the acknowledge button as soon as the dialog opens.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      ackRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    // onOpenChange={() => {}} makes this fully controlled — Radix's internal close logic is
    // suppressed and the caller owns open state exclusively via onAcknowledge.
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        {/*
         * AlertDialogPrimitive.Content used directly (not the shared AlertDialogContent wrapper)
         * so we can gate zoom+slide with motion-safe: while keeping the fade unconditionally.
         * Radix sets role="alertdialog" automatically on this element.
         */}
        <AlertDialogPrimitive.Content
          data-testid="stage-modal"
          // Escape is the only exit gesture AlertDialog.Content exposes — block it so the
          // candidate MUST click the button. Outside-click is already blocked by Radix
          // AlertDialog's built-in DismissableLayer configuration (no onPointerDownOutside needed).
          onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}
          className={[
            // Layout + surface — mirrors AlertDialogContent from the shared component.
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg',
            'translate-x-[-50%] translate-y-[-50%] gap-4',
            'border bg-background p-6 shadow-lg sm:rounded-lg',
            // Design-system animation tokens.
            'duration-base ease-smooth',
            // Fade always applies (both motion modes).
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            // Zoom + slide only when the user has NOT requested reduced motion.
            'motion-safe:data-[state=closed]:zoom-out-95',
            'motion-safe:data-[state=open]:zoom-in-95',
            'motion-safe:data-[state=closed]:slide-out-to-left-1/2',
            'motion-safe:data-[state=closed]:slide-out-to-top-[48%]',
            'motion-safe:data-[state=open]:slide-in-from-left-1/2',
            'motion-safe:data-[state=open]:slide-in-from-top-[48%]',
          ].join(' ')}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {/* Description is the ARIA-described-by target — auto-announced on open. */}
            <AlertDialogDescription>
              {body} Press &ldquo;{buttonLabel}&rdquo; to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/*
           * Escalation note (spec §3): appears after 30 s unacknowledged. Wrapped in
           * aria-live="polite" so screen readers announce the new text without re-reading
           * the full dialog. The element is always present but empty until escalated.
           */}
          <p aria-live="polite" className="min-h-0 text-sm text-muted-foreground">
            {escalationNote ?? ''}
          </p>

          {/* Session-time transparency — always present (owner decision: timer never pauses). */}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Your session time is still running.
          </p>

          <AlertDialogFooter>
            {/* Single focusable control — no cancel, no close, no escape. */}
            <AlertDialogPrimitive.Action
              ref={ackRef}
              data-testid="stage-modal-ack"
              onClick={onAcknowledge}
              className={buttonVariants()}
            >
              {buttonLabel}
            </AlertDialogPrimitive.Action>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
