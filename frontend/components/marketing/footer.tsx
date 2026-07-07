import { Link } from 'next-view-transitions';
import { ShieldCheck, Lock, Globe, Database } from 'lucide-react';
import { Wordmark } from './wordmark';
import { SectionDivider } from './section';

type LiveLink = { label: string; href: string; soon?: false };
type SoonLink = { label: string; href?: never; soon: true };
type FooterLink = LiveLink | SoonLink;

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Features', href: '/product' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Blog', soon: true },
      { label: 'Careers', soon: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', soon: true },
      { label: 'Status', soon: true },
      { label: 'Changelog', soon: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

// Only defensible claims — SOC 2 Type II was aspirational and has been removed until certified.
const COMPLIANCE = [
  { icon: ShieldCheck, label: 'gVisor-isolated execution' },
  { icon: Lock, label: 'Encrypted in transit & at rest' },
  { icon: Globe, label: 'GDPR-ready' },
  { icon: Database, label: 'Sandboxed, no network access' },
] as const;

export function Footer() {
  return (
    <footer className="overflow-hidden bg-surface-deep">
      {/* The brand, at architectural scale — the page signs its name (together.ai register). */}
      <div className="mx-auto max-w-6xl px-6 pt-14">
        <p
          aria-hidden="true"
          className="select-none whitespace-nowrap text-[clamp(72px,12.5vw,168px)] font-medium leading-[0.9] tracking-[-0.045em] text-foreground"
        >
          finite<span className="text-primary">.</span>
        </p>
      </div>

      {/* Section 1 — brand, navigation, and the compliance strip */}
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-6">
          {/* Brand column — spans 2 cols */}
          <div className="col-span-2">
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              The autonomous technical interviewer. Deterministic, sandboxed, auditable.
            </p>
            <p className="mt-4 font-mono text-[11px] text-foreground-subtle">
              state: end
              <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-primary/70 align-baseline motion-safe:animate-pulse" />
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-medium text-foreground">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) =>
                  l.soon ? (
                    <li key={l.label}>
                      <span className="text-sm text-foreground-subtle cursor-default select-none">
                        {l.label}
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                          soon
                        </span>
                      </span>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </nav>
          ))}
        </div>

        {/* Compliance / security strip */}
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
          {COMPLIANCE.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-4 w-4 text-primary/70" aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Faded hairline between the two footer sections */}
      <SectionDivider />

      {/* Section 2 — copyright and legal */}
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-5 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Finite. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <span className="text-xs text-foreground-subtle">Candidate data stays isolated.</span>
        </div>
      </div>
    </footer>
  );
}
