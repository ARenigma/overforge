'use client';

import { Reveal } from '@/components/marketing/reveal';
import { BrowserFrame } from '@/components/marketing/browser-frame';

/** Static IDE mock — token-driven, non-interactive. Squarish: sidebar + editor + console. */
export function EditorShowcase() {
  return (
    <section id="editor" className="w-full bg-surface-200">
      <div className="mx-auto w-full max-w-5xl px-6 py-24 sm:py-28">
        <div className="text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Stay in flow. <span className="text-muted-foreground">A real IDE, sandboxed.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            Split-pane CodeMirror, multi-language, with isolated execution.
          </p>
        </div>

        <Reveal className="mt-10">
          <BrowserFrame url="overforge.app/i/x7f2k9">
            {/* Editor tab strip (the app's own tabs, inside the browser chrome) */}
            <div className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2">
              <span className="rounded-md border border-border bg-background/60 px-3 py-0.5 font-mono text-xs text-foreground">
                main.py
              </span>
              <span className="hidden rounded-md border border-border bg-background/40 px-3 py-0.5 font-mono text-xs text-foreground-subtle sm:inline">
                solution.go
              </span>
              <span className="hidden rounded-md border border-border bg-background/40 px-3 py-0.5 font-mono text-xs text-foreground-subtle sm:inline">
                test_main.py
              </span>
            </div>

            {/* Body: sidebar + editor (VS Code-style; console sits below) */}
            <div className="grid min-h-[340px] md:min-h-[470px] md:grid-cols-[210px_1fr]">
              {/* File tree */}
              <div className="hidden border-r border-border bg-background/40 py-4 md:block">
                <p className="mb-2 px-4 font-mono text-[10px] uppercase tracking-wider text-foreground-subtle">
                  Explorer
                </p>
                <ul className="space-y-0.5 px-3 font-mono text-[12px]">
                  <li className="text-foreground-subtle">src/</li>
                  <li className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                    &nbsp;&nbsp;main.py
                  </li>
                  <li className="px-2 text-foreground-subtle">&nbsp;&nbsp;solution.go</li>
                  <li className="mt-1 text-foreground-subtle">tests/</li>
                  <li className="px-2 text-foreground-subtle">&nbsp;&nbsp;test_main.py</li>
                  <li className="mt-1 text-foreground-subtle">README.md</li>
                </ul>
              </div>

              {/* Code area */}
              <div className="overflow-x-auto py-4">
                <table className="w-full border-collapse font-mono text-[13px] leading-6">
                  <tbody>
                    {CODE_LINES.map((line, i) => (
                      <tr key={i} className="group">
                        <td className="w-12 select-none pr-4 text-right text-foreground-ghost group-hover:text-foreground-subtle">
                          {i + 1}
                        </td>
                        <td className="pr-8 whitespace-pre">{renderLine(line)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Console / output strip */}
            <div className="border-t border-border bg-background/40 px-4 py-3 font-mono text-[12px] leading-relaxed">
              <div className="flex items-center gap-2">
                <span className="text-primary">{'▸'}</span>
                <span className="text-muted-foreground">python main.py</span>
              </div>
              <div className="mt-1 text-foreground">[0, 1]</div>
              <div className="mt-1">
                <span className="text-primary">{'✓'} two_sum &middot; basic</span>
                <span className="mx-3 text-primary">{'✓'} two_sum &middot; edge</span>
                <span className="text-foreground-subtle">2 passed &middot; 0 failed</span>
              </div>
              <div className="mt-1 text-foreground-subtle">{'✓'} 0.21s &middot; network: none</div>
            </div>
          </BrowserFrame>
        </Reveal>
      </div>
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
  [
    { text: '    return', type: 'keyword' },
    { text: ' []', type: 'plain' },
  ],
  [{ text: '', type: 'plain' }],
  [
    { text: 'print', type: 'plain' },
    { text: '(two_sum([2, 7, 11, 15], 9))', type: 'plain' },
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
        <span key={i} className="text-foreground-subtle italic">
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
