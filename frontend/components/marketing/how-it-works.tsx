import { Mic, Code2, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';

/* ── step card ── */

function StepCard({
  step,
  icon: Icon,
  title,
  description,
  className,
}: {
  step: string;
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-accent/30',
        className
      )}
    >
      <span className="font-mono text-3xl font-semibold leading-none text-primary">{step}</span>
      <Icon className="mt-4 h-5 w-5 text-primary" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/* ── section ── */

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading
        lead="How it works."
        tail="Three steps, fully automated."
        sub="From invite to scorecard without a human in the loop."
        align="center"
      />
      <Reveal className="mt-12 grid gap-4 sm:grid-cols-3">
        <StepCard
          step="01"
          icon={Mic}
          title="Spoken oral round"
          description="The AI asks role-specific questions out loud and adapts its follow-ups to the candidate's answers — no script, no railroading."
        />
        <StepCard
          step="02"
          icon={Code2}
          title="Live coding"
          description="The candidate solves real problems in a sandboxed, multi-language IDE with isolated execution — no internet, no escape."
        />
        <StepCard
          step="03"
          icon={ClipboardCheck}
          title="Deterministic scorecard"
          description="A fixed rubric scores every answer identically and lands in your inbox within minutes of the session ending."
        />
      </Reveal>
    </Section>
  );
}
