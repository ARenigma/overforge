import { BrowserFrame } from '@/components/marketing/browser-frame';
import { Sparkles } from 'lucide-react';

/**
 * The hero's product visual — a curated, static snapshot of an Overforge interview in progress:
 * code on the left, the autonomous interviewer probing + dropping a hint on the right. Shows the
 * USP (an AI that reads the work and steps in) instead of describing it. Token-driven; no JS.
 */
export function HeroShowcase() {
  return (
    <BrowserFrame url="overforge.app/i/x7f2k9" className="shadow-2xl shadow-black/40">
      <div className="grid md:grid-cols-[1.05fr_1fr]">
        {/* ── Code pane ── */}
        <div className="border-b border-border bg-background/40 p-4 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-md border border-border bg-background/60 px-2.5 py-0.5 font-mono text-[11px] text-foreground">
              two_sum.py
            </span>
            <span className="font-mono text-[11px] text-foreground-subtle">Python</span>
          </div>
          <table className="w-full border-collapse font-mono text-[12px] leading-6">
            <tbody>
              {CODE.map((line, i) => (
                <tr key={i}>
                  <td className="w-7 select-none pr-3 text-right text-foreground-ghost">{i + 1}</td>
                  <td className="whitespace-pre">{render(line)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 border-t border-border pt-2 font-mono text-[11px] leading-relaxed">
            <span className="text-primary">▸</span>{' '}
            <span className="text-muted-foreground">python two_sum.py</span>
            <div className="mt-1 text-destructive">IndexError: list index out of range</div>
          </div>
        </div>

        {/* ── Interview chat pane ── */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-sm bg-primary text-primary-foreground">
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M3 11.5 8 3l5 8.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 11.5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-xs font-semibold text-foreground">Interviewer</span>
          </div>

          <p className="px-0.5 text-[10px] font-mono uppercase tracking-wider text-foreground-subtle">
            Interviewer
          </p>
          <div className="border border-border bg-surface-200 px-3 py-2 text-[13px] leading-relaxed text-foreground">
            What&apos;s the time complexity of your lookup — and what happens on the very first
            iteration?
          </div>

          <p className="self-end px-0.5 text-[10px] font-mono uppercase tracking-wider text-primary/80">
            You
          </p>
          <div className="self-end border border-primary/40 bg-primary/15 px-3 py-2 text-[13px] font-medium leading-relaxed text-foreground">
            O(1) average — it&apos;s a hashmap. Hmm, but the index error…
          </div>

          <div className="border-l-2 border-primary bg-primary/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Hint
            </div>
            <p className="text-[13px] leading-relaxed text-foreground">
              You read <span className="font-mono text-primary">seen[i]</span> before it&apos;s
              assigned — trace the first pass and check what&apos;s in the map.
            </p>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

type Seg = { t: string; k?: 'kw' | 'fn' | 'com' };
const CODE: Seg[][] = [
  [{ t: 'def', k: 'kw' }, { t: ' two_sum(nums, target):' }],
  [{ t: '    seen = {}' }],
  [
    { t: '    ', k: 'com' },
    { t: 'for', k: 'kw' },
    { t: ' i, n ' },
    { t: 'in', k: 'kw' },
    { t: ' enumerate(nums):' },
  ],
  [
    { t: '        ', k: 'com' },
    { t: 'if', k: 'kw' },
    { t: ' target - n ' },
    { t: 'in', k: 'kw' },
    { t: ' seen:' },
  ],
  [{ t: '            ', k: 'com' }, { t: 'return', k: 'kw' }, { t: ' [seen[i], i]' }],
  [{ t: '        seen[n] = i' }],
];

function render(line: Seg[]) {
  return line.map((s, i) =>
    s.k === 'kw' ? (
      <span key={i} className="text-primary">
        {s.t}
      </span>
    ) : (
      <span key={i} className="text-muted-foreground">
        {s.t}
      </span>
    )
  );
}
