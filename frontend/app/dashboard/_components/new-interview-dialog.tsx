"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { createInterview } from "@/lib/api";
import { Plus, Copy, Check, Loader2, ExternalLink } from "lucide-react";

export function NewInterviewDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Form state
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetState() {
    setCandidateEmail("");
    setCandidateName("");
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
        throw new Error("Your session has expired. Please sign in again.");
      }

      const result = await createInterview(session.access_token, {
        candidateEmail: candidateEmail.trim(),
        ...(candidateName.trim() ? { candidateName: candidateName.trim() } : {}),
      });

      setLink(result.link);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create interview.");
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
        <Button className="h-9 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white text-sm gap-2 focus-visible:ring-2 focus-visible:ring-[#2F6BFF]">
          <Plus className="w-4 h-4" />
          New interview
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-[#141619] border border-[#2A2E37] text-[#EAECEF] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#EAECEF] text-base">
            {link ? "Interview created" : "Create interview"}
          </DialogTitle>
        </DialogHeader>

        {link ? (
          // ── Result view ──────────────────────────────────────────────────
          <div className="space-y-5 pt-1">
            <p className="text-sm text-[#9AA1AC]">
              Share this link with the candidate. It contains their session token and
              expires automatically.
            </p>

            {/* Link display + copy */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-[#1C1F25] border border-[#2A2E37] rounded-lg px-3 py-2.5 text-xs text-[#EAECEF] font-mono truncate select-all">
                {link}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0 h-9 w-9 border-[#2A2E37] bg-[#1C1F25] text-[#9AA1AC] hover:text-[#EAECEF] hover:bg-[#2A2E37] focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
                aria-label="Copy link"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[#34D399]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md border border-[#2A2E37] bg-[#1C1F25] text-[#9AA1AC] hover:text-[#EAECEF] hover:bg-[#2A2E37] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
                aria-label="Open link in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <Button
              onClick={handleDone}
              className="w-full h-9 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white text-sm focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
            >
              Done
            </Button>
          </div>
        ) : (
          // ── Create form ──────────────────────────────────────────────────
          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            {error && (
              <Alert className="border-[#F2555A]/40 bg-[#F2555A]/10 py-2 px-3">
                <AlertDescription className="text-[#F2555A] text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="ni-email"
                className="text-[#9AA1AC] text-xs uppercase tracking-wide"
              >
                Candidate email <span className="text-[#F2555A]">*</span>
              </Label>
              <Input
                id="ni-email"
                type="email"
                required
                autoFocus
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="bg-[#0A0B0D] border-[#2A2E37] text-[#EAECEF] placeholder:text-[#9AA1AC]/50 focus-visible:ring-[#2F6BFF] focus-visible:border-[#2F6BFF] h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="ni-name"
                className="text-[#9AA1AC] text-xs uppercase tracking-wide"
              >
                Candidate name{" "}
                <span className="text-[#9AA1AC]/60 normal-case tracking-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="ni-name"
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Jane Smith"
                className="bg-[#0A0B0D] border-[#2A2E37] text-[#EAECEF] placeholder:text-[#9AA1AC]/50 focus-visible:ring-[#2F6BFF] focus-visible:border-[#2F6BFF] h-10"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 h-9 border-[#2A2E37] bg-transparent text-[#9AA1AC] hover:text-[#EAECEF] hover:bg-[#1C1F25] text-sm focus-visible:ring-2 focus-visible:ring-[#2F6BFF]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !candidateEmail.trim()}
                className="flex-1 h-9 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white text-sm focus-visible:ring-2 focus-visible:ring-[#2F6BFF] disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create & get link"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
