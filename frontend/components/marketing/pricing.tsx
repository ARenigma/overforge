// Placeholder pricing — confirm tiers + prices before launch.

import { Link } from 'next-view-transitions';
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

function PricingColumn({ tier }: { tier: Tier }) {
  return (
    <div className="relative flex flex-col p-6 lg:p-8">
      {/* The recommended tier speaks in the site's one accent device: a 2px primary bar riding the
          top hairline (the anatomy-tab signature) — never a box, never a ring. */}
      {tier.highlighted && (
        <span aria-hidden="true" className="absolute inset-x-0 -top-px h-[2px] bg-primary" />
      )}

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-subtle">
          tier:{' '}
          <span className={tier.highlighted ? 'text-primary' : 'text-foreground'}>
            {tier.name.toLowerCase()}
          </span>
        </span>
        {tier.highlighted && (
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-primary">
            recommended
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-mono text-4xl tracking-tight text-foreground">{tier.price}</span>
        {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{tier.desc}</p>

      <ul className="mt-6 flex flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Link
          href={tier.href}
          className={cn(
            'inline-flex h-11 w-full items-center justify-center rounded-md font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-fast ease-out-cubic',
            tier.highlighted
              ? 'bg-primary text-primary-foreground transition-opacity hover:opacity-90'
              : 'border border-border text-foreground hover:bg-accent'
          )}
        >
          {tier.cta}
        </Link>
      </div>
    </div>
  );
}

/** The four pricing tiers as flat columns on hairlines — no boxes (together.ai register). */
export function PricingTiers() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <Reveal>
        <div className="grid divide-y divide-border border-y border-border lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {PRICING_TIERS.map((tier) => (
            <PricingColumn key={tier.name} tier={tier} />
          ))}
        </div>
      </Reveal>
    </div>
  );
}
