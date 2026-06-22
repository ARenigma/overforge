'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/ds/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { createInterview } from '@/lib/api';
import { Plus, Copy, Check, ExternalLink } from 'lucide-react';

export function NewInterviewDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Form state
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetState() {
    setCandidateEmail('');
    setCandidateName('');
    setSubmitting(false);
    setError(null);
    setLink(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateEmail.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const result = await createInterview(session.access_token, {
        candidateEmail: candidateEmail.trim(),
        ...(candidateName.trim() ? { candidateName: candidateName.trim() } : {}),
      });

      setLink(result.link);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create interview.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  function handleDone() {
    setOpen(false);
    resetState();
    router.refresh();
  }

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value) resetState();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="rounded-md px-5 h-9 bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] text-sm gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          New interview
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-card border border-border text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">
            {link ? 'Interview created' : 'Create interview'}
          </DialogTitle>
        </DialogHeader>

        {link ? (
          // ── Result view ──────────────────────────────────────────────────
          <div className="space-y-5 pt-1">
            <p className="text-sm text-muted-foreground">
              Share this link with the candidate. It contains their session token and expires
              automatically.
            </p>

            {/* Link display + copy */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-muted border border-border rounded-md px-3 py-2.5 text-xs text-foreground font-mono truncate select-all">
                {link}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0 h-9 w-9 border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                aria-label="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open link in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <Button
              onClick={handleDone}
              className="w-full h-9 bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] text-sm"
            >
              Done
            </Button>
          </div>
        ) : (
          // ── Create form ──────────────────────────────────────────────────
          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            {error && (
              <Alert className="border-destructive/40 bg-destructive/10 py-2 px-3">
                <AlertDescription className="text-destructive text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <Field id="ni-email" label="Candidate email" required>
              <Input
                id="ni-email"
                type="email"
                required
                autoFocus
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="bg-background border-input text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring h-10"
              />
            </Field>

            <Field id="ni-name" label="Candidate name" optional>
              <Input
                id="ni-name"
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Jane Smith"
                className="bg-background border-input text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring h-10"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 h-9 border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent text-sm"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
                disabled={!candidateEmail.trim()}
                className="flex-1 h-9 bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] text-sm disabled:opacity-50"
              >
                Create &amp; get link
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
