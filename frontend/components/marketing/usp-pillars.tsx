'use client';

import { MessagesSquare, AudioLines, Scale, TerminalSquare, type LucideIcon } from 'lucide-react';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';

/* The four things that make Overforge an actual interview, not a coding quiz — shown up front so a
   first-time visitor grasps the differentiator before anything else. Lead pillar = the moat: the
   interviewer adapts (counter-questions + hints), which static graders (LeetCode/HackerRank) can't do. */
const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessagesSquare,
    title: 'Thinks on its feet',
    body: 'Asks counter-questions, probes shaky reasoning, and offers a hint when a candidate is genuinely stuck — like a senior interviewer, not a fixed script.',
  },
  {
    icon: AudioLines,
    title: 'A real conversation',
    body: 'A spoken oral round, not a form. The candidate talks through their thinking out loud; the AI listens, responds, and follows up.',
  },
  {
    icon: Scale,
    title: 'The same bar for everyone',
    body: 'Every candidate gets the same questions and the same rubric. Deterministic scores you can defend to a candidate — or to a court.',
  },
  {
    icon: TerminalSquare,
    title: 'Real code, really run',
    body: 'Split-pane editor over a sandboxed executor. The AI sees both the code and its output — so nobody talks around a bug they never fixed.',
  },
];

export function UspPillars() {
  return (
    <Section id="why" tone="raised">
      <SectionHeading
        lead="Not a coding quiz."
        tail="A real interview, at scale."
        sub="The first-round technical screen, run end to end by an AI that actually interviews — it adapts, it probes, it scores fairly. Your engineers only meet the people worth their time."
      />
      <Reveal className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="group relative isolate flex flex-col overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
          >
            {/* Ember glow on hover — matches the bento cards (catches the lava light from above). */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  'radial-gradient(130% 90% at 50% -20%, hsl(var(--primary) / 0.12), transparent 65%)',
              }}
            />
            <p.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mt-3 text-base font-medium text-foreground">{p.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </Reveal>
    </Section>
  );
}
