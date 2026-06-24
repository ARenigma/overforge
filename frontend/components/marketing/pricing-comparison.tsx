import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { PRICING_TIERS } from './pricing';
import { cn } from '@/lib/utils';

/** true = included (check), false = not included (dash), string = a value. */
type Cell = boolean | string;
interface FeatureRow {
  label: string;
  cells: [Cell, Cell, Cell, Cell];
}
interface Group {
  category: string;
  rows: FeatureRow[];
}

// Columns follow PRICING_TIERS order: Free, Pro, Team, Enterprise.
const GROUPS: Group[] = [
  {
    category: 'Interviews',
    rows: [
      { label: 'Interviews per month', cells: ['5', '100', 'Unlimited', 'Unlimited'] },
      { label: 'Spoken oral round', cells: [true, true, true, true] },
      { label: 'Live coding (sandboxed)', cells: [true, true, true, true] },
      { label: 'Interview history', cells: ['7 days', '90 days', '1 year', 'Custom'] },
    ],
  },
  {
    category: 'Coding environment',
    rows: [
      { label: 'Supported languages', cells: ['All', 'All', 'All', 'All'] },
      { label: 'Isolated execution, no network', cells: [true, true, true, true] },
      { label: 'Custom problem sets', cells: [false, true, true, true] },
      { label: 'Bring your own problems', cells: [false, false, true, true] },
    ],
  },
  {
    category: 'Scoring & rubrics',
    rows: [
      { label: 'Deterministic scorecard', cells: [true, true, true, true] },
      { label: 'Custom rubrics', cells: [false, true, true, true] },
      { label: 'CSV + API export', cells: [false, true, true, true] },
      { label: 'Calibration & benchmarks', cells: [false, false, true, true] },
    ],
  },
  {
    category: 'Team & security',
    rows: [
      { label: 'Team members', cells: ['1', '5', 'Unlimited', 'Unlimited'] },
      { label: 'Single sign-on (SSO)', cells: [false, false, true, true] },
      { label: 'SAML / SCIM', cells: [false, false, false, true] },
      { label: 'Audit logs', cells: [false, false, true, true] },
      { label: 'Data isolation', cells: [true, true, true, true] },
    ],
  },
  {
    category: 'Support',
    rows: [
      { label: 'Community', cells: [true, true, true, true] },
      { label: 'Email', cells: [false, true, true, true] },
      { label: 'Priority', cells: [false, false, true, true] },
      { label: 'Dedicated manager + SLA', cells: [false, false, false, true] },
    ],
  },
];

function renderCell(c: Cell) {
  if (c === true) return <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />;
  if (c === false)
    return <Minus className="mx-auto h-4 w-4 text-foreground-ghost" aria-label="Not included" />;
  return <span className="text-sm text-foreground">{c}</span>;
}

export function PricingComparison() {
  return (
    <Section>
      <SectionHeading lead="Compare plans." tail="Every feature, side by side." align="center" />
      <Reveal className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead className="bg-background">
            <tr className="border-b border-border">
              <th className="w-2/5 py-4 pr-4 text-left text-sm font-medium text-foreground">
                Features
              </th>
              {PRICING_TIERS.map((t) => (
                <th
                  key={t.name}
                  className={cn(
                    'py-4 text-center text-sm font-medium',
                    t.highlighted ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Fragment key={g.category}>
                <tr>
                  <td
                    colSpan={5}
                    className="bg-muted/40 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    {g.category}
                  </td>
                </tr>
                {g.rows.map((row) => (
                  <tr key={row.label} className="border-b border-border/60">
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{row.label}</td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="py-3 text-center align-middle">
                        {renderCell(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Reveal>
    </Section>
  );
}
