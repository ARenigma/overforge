'use client';

/**
 * PresenceCue — subtle "Reading your code…" indicator in the chat pane.
 *
 * Rendered aria-hidden (decorative) so screen readers ignore it.
 * Mirrors the muted/mono/italic styling of the ai-thinking indicator but
 * intentionally smaller and less prominent — the cue signals ambient attention,
 * not a pending turn. Drive visibility from page.tsx; the component itself is
 * stateless so the parent controls both the pre-speech lead and the ambient schedule.
 */
export function PresenceCue({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div data-testid="presence-cue" aria-hidden="true" className="flex justify-start">
      <div className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[10px] italic text-foreground-subtle">
        <span className="animate-pulse tracking-widest">···</span>
        <span>Reading your code…</span>
      </div>
    </div>
  );
}
