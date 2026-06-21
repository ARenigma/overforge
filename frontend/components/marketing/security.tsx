import { ShieldCheck, WifiOff, Database, Lock, type LucideIcon } from 'lucide-react';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';

/* ── feature card ── */

function FeatureCard({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-accent/30',
        className
      )}
    >
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/* ── section ── */

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Sandboxed execution',
    description:
      'Each run spins up an isolated container that is torn down the moment it finishes.',
  },
  {
    icon: WifiOff,
    title: 'No network access',
    description:
      "Submitted code runs with network disabled, so it can't phone home or reach internal systems.",
  },
  {
    icon: Database,
    title: 'Data isolation',
    description:
      "Every candidate's data is scoped to a single interview and never shared across runs.",
  },
  {
    icon: Lock,
    title: 'Encrypted throughout',
    description: 'All traffic is encrypted in transit and data is encrypted at rest.',
  },
];

export function Security() {
  return (
    <Section id="security">
      <SectionHeading
        lead="Secure by design."
        tail="Enterprise-ready from day one."
        sub="Every interview runs in a locked-down sandbox — candidate code never touches your infrastructure."
        align="center"
      />
      <Reveal className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
        ))}
      </Reveal>
    </Section>
  );
}
