// Placeholder pricing — confirm tiers + prices before launch.

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';

interface Tier {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
}

const TIERS: Tier[] = [
  {
    name: 'Starter',
    price: '$0',
    period: '/forever',
    desc: 'For trying Overforge',
    features: ['5 interviews / month', 'All languages', 'Email scorecards'],
    cta: 'Start free',
    href: '/auth',
    highlighted: false,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/month',
    desc: 'For growing teams',
    features: ['Unlimited interviews', 'Custom rubrics', 'SSO', 'Priority support'],
    cta: 'Start free',
    href: '/auth',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For high-volume hiring',
    features: ['SAML / SCIM', 'Audit logs', 'Dedicated support', 'SLA'],
    cta: 'Contact sales',
    href: '#',
    highlighted: false,
  },
];

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card p-6',
        tier.highlighted ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      )}
    >
      {/* Name + badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{tier.name}</span>
        {tier.highlighted && (
          <span className="font-mono text-[11px] font-medium text-primary">Most popular</span>
        )}
      </div>

      {/* Price */}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{tier.price}</span>
        {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
      </div>

      {/* Description */}
      <p className="mt-1.5 text-sm text-muted-foreground">{tier.desc}</p>

      {/* Feature list */}
      <ul className="mt-6 flex flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm">
            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA — pushed to bottom so cards align */}
      <div className="mt-auto pt-8">
        <Link
          href={tier.href}
          className={cn(
            'inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors',
            tier.highlighted
              ? 'bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]'
              : 'border border-border bg-card text-foreground hover:bg-accent'
          )}
        >
          {tier.cta}
        </Link>
      </div>
    </div>
  );
}

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        lead="Simple, transparent pricing."
        tail="Scale when you do."
        sub="Start free. Upgrade when your hiring volume grows."
        align="center"
      />
      <Reveal className="mt-12 grid gap-6 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <PricingCard key={tier.name} tier={tier} />
        ))}
      </Reveal>
    </Section>
  );
}
