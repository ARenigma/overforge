'use client';

import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';

/** Static IDE mock — token-driven, non-interactive. Intentionally wider than standard Section. */
export function EditorShowcase() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-24 sm:py-28" id="editor">
      <div className="text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Stay in flow. <span className="text-muted-foreground">A real IDE, sandboxed.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
          Split-pane CodeMirror, multi-language, with isolated execution.
        </p>
      </div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 overflow-hidden rounded-xl border border-border bg-card"
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-muted" />
            <span className="h-3 w-3 rounded-full bg-muted" />
            <span className="h-3 w-3 rounded-full bg-muted" />
          </div>
          <div className="rounded-md border border-border bg-background/60 px-3 py-0.5 font-mono text-xs text-foreground">
            main.py
          </div>
          <div className="ml-2 hidden items-center gap-2 sm:flex">
            <span className="rounded-md border border-border bg-background/40 px-3 py-0.5 font-mono text-xs text-muted-foreground/60">
              solution.go
            </span>
            <span className="rounded-md border border-border bg-background/40 px-3 py-0.5 font-mono text-xs text-muted-foreground/60">
              test_main.py
            </span>
          </div>
        </div>

        {/* Body: file tree + code + output */}
        <div className="grid min-h-[460px] md:min-h-[520px] md:grid-cols-[200px_1fr_280px]">
          {/* File tree */}
          <div className="hidden border-r border-border bg-background/40 py-4 md:block">
            <p className="mb-2 px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
              Explorer
            </p>
            <ul className="space-y-0.5 px-3 font-mono text-[12px]">
              <li className="text-muted-foreground/70">src/</li>
              <li className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                &nbsp;&nbsp;main.py
              </li>
              <li className="px-2 text-muted-foreground/60">&nbsp;&nbsp;solution.go</li>
              <li className="mt-1 text-muted-foreground/70">tests/</li>
              <li className="px-2 text-muted-foreground/60">&nbsp;&nbsp;test_main.py</li>
              <li className="mt-1 text-muted-foreground/60">README.md</li>
            </ul>
          </div>

          {/* Code area */}
          <div className="overflow-x-auto border-r border-border py-4">
            <table className="w-full border-collapse font-mono text-[13px] leading-6">
              <tbody>
                {CODE_LINES.map((line, i) => (
                  <tr key={i} className="group">
                    <td className="w-12 select-none pr-4 text-right text-muted-foreground/30 group-hover:text-muted-foreground/60">
                      {i + 1}
                    </td>
                    <td className="pr-8 whitespace-pre">{renderLine(line)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Output panel */}
          <div className="hidden flex-col md:flex">
            <div className="border-b border-border px-4 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                Output
              </p>
            </div>
            <div className="flex-1 bg-background/40 px-4 py-3 font-mono text-[12px] leading-relaxed">
              <div className="flex items-center gap-2">
                <span className="text-primary">{'▸'}</span>
                <span className="text-muted-foreground">python main.py</span>
              </div>
              <div className="mt-2 text-foreground">[0, 1]</div>
              <div className="text-foreground">5</div>
              <div className="mt-2 text-muted-foreground/60">
                {'✓'} 0.21s &middot; network: none
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  Test Results
                </p>
                <div className="mt-2 space-y-1 text-[12px]">
                  <div className="text-primary">{'✓'} two_sum &middot; basic</div>
                  <div className="text-primary">{'✓'} two_sum &middot; edge</div>
                  <div className="text-primary">{'✓'} max_profit &middot; basic</div>
                  <div className="text-primary">{'✓'} max_profit &middot; flat</div>
                  <div className="mt-1 text-muted-foreground/60">4 passed &middot; 0 failed</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Console strip */}
        <div className="border-t border-border bg-background/40 px-4 py-3 font-mono text-[12px] leading-relaxed">
          <span className="text-primary">{'▸'}</span>
          <span className="text-muted-foreground"> python main.py</span>
          <div className="text-foreground">42</div>
          <div className="text-muted-foreground">{'✓'} 0.21s &middot; network: none</div>
        </div>
      </motion.div>
    </section>
  );
}

/* ── Static code lines with minimal token coloring ── */

type CodeSegment = { text: string; type: 'keyword' | 'string' | 'comment' | 'plain' };

type CodeLine = CodeSegment[];

const CODE_LINES: CodeLine[] = [
  [{ text: 'from typing import List', type: 'plain' }],
  [{ text: '', type: 'plain' }],
  [
    { text: 'def', type: 'keyword' },
    { text: ' two_sum(nums: List[int], target: int) -> List[int]:', type: 'plain' },
  ],
  [{ text: '    """Return indices of two numbers that add to target."""', type: 'comment' }],
  [{ text: '    seen: dict[int, int] = {}', type: 'plain' }],
  [{ text: '', type: 'plain' }],
  [
    { text: '    ', type: 'plain' },
    { text: 'for', type: 'keyword' },
    { text: ' i, num ', type: 'plain' },
    { text: 'in', type: 'keyword' },
    { text: ' enumerate(nums):', type: 'plain' },
  ],
  [{ text: '        complement = target - num', type: 'plain' }],
  [
    { text: '        ', type: 'plain' },
    { text: 'if', type: 'keyword' },
    { text: ' complement ', type: 'plain' },
    { text: 'in', type: 'keyword' },
    { text: ' seen:', type: 'plain' },
  ],
  [
    { text: '            ', type: 'plain' },
    { text: 'return', type: 'keyword' },
    { text: ' [seen[complement], i]', type: 'plain' },
  ],
  [{ text: '        seen[num] = i', type: 'plain' }],
  [{ text: '', type: 'plain' }],
  [{ text: '    return', type: 'keyword' }],
  [{ text: '', type: 'plain' }],
  [
    { text: 'def', type: 'keyword' },
    { text: ' max_profit(prices: List[int]) -> int:', type: 'plain' },
  ],
  [{ text: '    """Best time to buy and sell stock (one transaction)."""', type: 'comment' }],
  [
    { text: '    min_price = float(', type: 'plain' },
    { text: "'inf'", type: 'string' },
    { text: ')', type: 'plain' },
  ],
  [{ text: '    best = 0', type: 'plain' }],
  [
    { text: '    ', type: 'plain' },
    { text: 'for', type: 'keyword' },
    { text: ' price ', type: 'plain' },
    { text: 'in', type: 'keyword' },
    { text: ' prices:', type: 'plain' },
  ],
  [{ text: '        min_price = min(min_price, price)', type: 'plain' }],
  [{ text: '        best = max(best, price - min_price)', type: 'plain' }],
  [
    { text: '    ', type: 'plain' },
    { text: 'return', type: 'keyword' },
    { text: ' best', type: 'plain' },
  ],
  [{ text: '', type: 'plain' }],
  [
    { text: 'print', type: 'plain' },
    { text: '(two_sum([2, 7, 11, 15], 9))', type: 'plain' },
  ],
  [
    { text: 'print', type: 'plain' },
    { text: '(max_profit([7, 1, 5, 3, 6, 4]))', type: 'plain' },
  ],
];

function renderLine(segments: CodeLine) {
  return segments.map((seg, i) => {
    if (seg.type === 'keyword') {
      return (
        <span key={i} className="text-primary">
          {seg.text}
        </span>
      );
    }
    if (seg.type === 'string') {
      return (
        <span key={i} className="text-accent-foreground/80">
          {seg.text}
        </span>
      );
    }
    if (seg.type === 'comment') {
      return (
        <span key={i} className="text-muted-foreground/60 italic">
          {seg.text}
        </span>
      );
    }
    return (
      <span key={i} className="text-muted-foreground">
        {seg.text}
      </span>
    );
  });
}
