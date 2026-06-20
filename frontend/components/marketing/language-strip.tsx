const LANGUAGES = ['Python', 'JavaScript', 'Java', 'C++', 'Go', 'Ruby'] as const;

/** Honest "social proof" strip — the real languages we execute natively (mirrors
 *  Supabase's customer-logo strip, with a clean top/bottom separation). */
export function LanguageStrip() {
  return (
    <div className="border-y border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Runs every candidate&apos;s code natively
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {LANGUAGES.map((l) => (
            <span key={l} className="font-mono text-sm text-muted-foreground/70">
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
