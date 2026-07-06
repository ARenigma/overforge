// Placeholder pricing — confirm tiers + prices before launch.

import Link from 'next/link';
import { Check } from 'lucide-react';
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

export const PRICING_TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/forever',
    desc: 'For trying Finite on a few candidates.',
    features: ['5 interviews / month', 'All languages', 'Email scorecards', 'Community support'],
    cta: 'Start free',
    href: '/auth',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    desc: 'For growing teams hiring every week.',
    features: ['100 interviews / month', 'Custom rubrics', 'CSV + API export', 'Email support'],
    cta: 'Start free',
    href: '/auth',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$199',
    period: '/month',
    desc: 'For scaling orgs with many interviewers.',
    features: ['Unlimited interviews', 'SSO', 'Audit logs', 'Priority support'],
    cta: 'Start free',
    href: '/auth',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For high-volume, compliance-heavy hiring.',
    features: ['SAML / SCIM', 'Dedicated manager', '99.9% uptime SLA', 'Custom retention'],
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
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{tier.name}</span>
        {tier.highlighted && (
          <span className="font-mono text-[11px] font-medium text-primary">Most popular</span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{tier.price}</span>
        {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
      </div>

      <p className="mt-1.5 text-sm text-muted-foreground">{tier.desc}</p>

      <ul className="mt-6 flex flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm">
            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

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

/** The four pricing tier cards — composed by the dedicated /pricing page. */
export function PricingTiers() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      <Reveal className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PRICING_TIERS.map((tier) => (
          <PricingCard key={tier.name} tier={tier} />
        ))}
      </Reveal>
    </div>
  );
}
