'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, ExternalLink, Mail } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Displays a read-only invite link with copy, open-in-tab, and email-client actions.
 * Used inside new-interview-dialog (after creation) and the regenerate-invite dialogs
 * in interview-row-actions and live-interview.
 */
export function InviteLinkPanel({
  link,
  candidateEmail,
}: {
  link: string;
  candidateEmail?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Invite link copied');
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Link display + copy + open-in-tab */}
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

      {/* Manual share: opens the mail client with the invite pre-filled. */}
      {candidateEmail && (
        <a
          href={`mailto:${encodeURIComponent(candidateEmail)}?subject=${encodeURIComponent(
            'Your Overforge technical interview'
          )}&body=${encodeURIComponent(
            `Hi,\n\nYou're invited to a technical interview. Open this link to begin — it's self-paced, ` +
              `conducted by our AI interviewer, and the link expires in 72 hours:\n\n${link}\n\nGood luck!`
          )}`}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Mail className="h-4 w-4" />
          Email invite to candidate
        </a>
      )}
    </div>
  );
}
