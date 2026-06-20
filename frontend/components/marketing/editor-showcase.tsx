'use client';

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp } from '@/lib/motion';

/** Static IDE mock — token-driven, non-interactive. */
export function EditorShowcase() {
  return (
    <Section id="editor">
      <SectionHeading
        lead="Stay in flow."
        tail="A real IDE, sandboxed."
        sub="Split-pane CodeMirror, multi-language, with isolated execution."
      />

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
        </div>

        {/* Body: file tree + code */}
        <div className="grid md:grid-cols-[160px_1fr]">
          {/* File tree — hidden on small screens */}
          <div className="hidden border-r border-border bg-background/40 py-4 md:block">
            <ul className="space-y-0.5 px-3 font-mono text-[12px]">
              <li className="text-muted-foreground">src/</li>
              <li className="rounded bg-muted/60 px-2 py-0.5 text-foreground">
                &nbsp;&nbsp;main.py
              </li>
              <li className="text-muted-foreground">tests/</li>
              <li className="text-muted-foreground">README.md</li>
            </ul>
          </div>

          {/* Code area */}
          <div className="overflow-x-auto py-4">
            <table className="w-full border-collapse font-mono text-[12px] leading-6">
              <tbody>
                {CODE_LINES.map((line, i) => (
                  <tr key={i} className="group">
                    <td className="w-10 select-none pr-4 text-right text-muted-foreground/40 group-hover:text-muted-foreground/60">
                      {i + 1}
                    </td>
                    <td className="pr-6 whitespace-pre">{renderLine(line)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </Section>
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
