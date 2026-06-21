import Link from 'next/link';
import { ShieldCheck, Lock, Globe, Database } from 'lucide-react';
import { Wordmark } from './wordmark';
import { SectionDivider } from './section';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Features', href: '/product' },
      { label: 'Languages', href: '#languages' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Careers', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '#' },
      { label: 'Status', href: '#' },
      { label: 'Changelog', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
  },
] as const;

// Placeholder compliance/security claims — confirm formal certifications (e.g. SOC 2) before production.
const COMPLIANCE = [
  { icon: ShieldCheck, label: 'SOC 2 Type II' },
  { icon: Lock, label: 'Encrypted in transit & at rest' },
  { icon: Globe, label: 'GDPR-ready' },
  { icon: Database, label: 'Sandboxed, no network access' },
] as const;

export function Footer() {
  return (
    <footer className="bg-[hsl(var(--surface-deep))]">
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
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
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
            href="#"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="#"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <span className="text-xs text-muted-foreground/70">Candidate data stays isolated.</span>
        </div>
      </div>
    </footer>
  );
}
