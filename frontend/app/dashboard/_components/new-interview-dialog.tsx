'use client';

import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { createInterview, getMe } from '@/lib/api';
import { Plus, Copy, Check, ExternalLink, Mail } from 'lucide-react';
import { toast } from 'sonner';

// Coding languages the interviewer can assign. 'any' = let the candidate choose in-room
// (today's behavior); a specific value locks the room to that language.
const LANGUAGE_OPTIONS = [
  { value: 'any', label: 'Candidate chooses' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
] as const;

// Seniority level — calibrates question difficulty/depth AND the grading bar (not the count;
// the flow is always 2 oral → 2 coding).
const LEVEL_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
] as const;

export function NewInterviewDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Form state
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [language, setLanguage] = useState<string>('any');
  const [level, setLevel] = useState<string>('mid');
  const [roleBrief, setRoleBrief] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only dev accounts (DEV_EMAILS) get the dev-mode toggle. Checked when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (!session?.access_token || cancelled) return;
        const me = await getMe(session.access_token);
        if (!cancelled) setIsDev(me.isDev);
      } catch {
        // non-dev / offline — no toggle, no problem
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Result state
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetState() {
    setCandidateEmail('');
    setCandidateName('');
    setLanguage('any');
    setLevel('mid');
    setRoleBrief('');
    setDevMode(false);
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
        ...(language !== 'any' ? { language } : {}),
        level,
        ...(roleBrief.trim() ? { roleBrief: roleBrief.trim() } : {}),
        ...(isDev && devMode ? { devMode: true } : {}),
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
      toast.success('Invite link copied');
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
          // min-w-0: this is a CSS-grid item (DialogContent is `grid`); without it the item's
          // default `min-width:auto` sizes to the long invite-URL's min-content and blows out past
          // the dialog, defeating the link row's `truncate`. min-w-0 lets the track cap at the dialog.
          <div className="min-w-0 space-y-5 pt-1">
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

            {/* Manual share: opens the interviewer's mail client with the invite pre-filled.
                No server-side send (that's a future gated feature). */}
            <a
              href={`mailto:${encodeURIComponent(candidateEmail)}?subject=${encodeURIComponent(
                'Your Overforge technical interview'
              )}&body=${encodeURIComponent(
                `Hi${candidateName ? ` ${candidateName}` : ''},\n\n` +
                  `You're invited to a technical interview. Open this link to begin — it's self-paced, ` +
                  `conducted by our AI interviewer, and the link expires in 72 hours:\n\n${link}\n\nGood luck!`
              )}`}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mail className="h-4 w-4" />
              Email invite to candidate
            </a>

            <Button
              onClick={handleDone}
              variant="outline"
              className="w-full h-9 border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent text-sm"
            >
              Done
            </Button>
          </div>
        ) : (
          // ── Create form ──────────────────────────────────────────────────
          <form onSubmit={handleSubmit} className="min-w-0 space-y-5 pt-1">
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

            <Field id="ni-language" label="Coding language">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger
                  id="ni-language"
                  className="h-10 bg-background border-input text-foreground focus-visible:ring-ring"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {LANGUAGE_OPTIONS.map((l) => (
                    <SelectItem key={l.value} value={l.value} className="focus:bg-muted">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {language === 'any'
                  ? 'The candidate picks their language in the room.'
                  : 'The room is locked to this language.'}
              </p>
            </Field>

            <Field id="ni-level" label="Seniority level">
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger
                  id="ni-level"
                  className="h-10 bg-background border-input text-foreground focus-visible:ring-ring"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {LEVEL_OPTIONS.map((l) => (
                    <SelectItem key={l.value} value={l.value} className="focus:bg-muted">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Sets question difficulty and the grading bar. The flow stays 2 oral + 2 coding.
              </p>
            </Field>

            <Field id="ni-role" label="Role brief" optional>
              <textarea
                id="ni-role"
                value={roleBrief}
                onChange={(e) => setRoleBrief(e.target.value)}
                rows={3}
                placeholder="e.g. Senior backend engineer — Go, distributed systems, on-call. Probe concurrency and API design."
                className="block w-full resize-none rounded-input border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Tailors the questions and grading to this role. Question count is unchanged.
              </p>
            </Field>

            {isDev && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-warning/40 bg-warning/10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={devMode}
                  onChange={(e) => setDevMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="text-sm text-warning-foreground">
                  Dev mode{' '}
                  <span className="text-xs text-muted-foreground">
                    — testing only: allows paste in the room and uses a short duration. Don&apos;t
                    use for real candidates.
                  </span>
                </span>
              </label>
            )}

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
