import Link from 'next/link';
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

// Note: SOC 2 Type II certification is aspirational — confirm formal audit completion before
// displaying this claim to customers.
const COMPLIANCE = [
  { icon: ShieldCheck, label: 'SOC 2 Type II' },
  { icon: Lock, label: 'Encrypted in transit & at rest' },
  { icon: Globe, label: 'GDPR-ready' },
  { icon: Database, label: 'Sandboxed, no network access' },
] as const;

export function Footer() {
  return (
    <footer className="bg-surface-deep">
      {/* Section 1 — brand, navigation, and the compliance strip */}
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-6">
          {/* Brand column — spans 2 cols */}
          <div className="col-span-2">
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Live technical interviews, run by an AI that listens.
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
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-5 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Overforge. All rights reserved.
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
