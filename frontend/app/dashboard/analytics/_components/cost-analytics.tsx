'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricCard } from '@/components/ds/metric-card';
import { DollarSign, Users, Gauge, Clock } from 'lucide-react';

export interface CostAnalyticsData {
  totals: { total_usd: number; events: number; interviews: number };
  per_interview: { avg_usd: number; max_usd: number; avg_duration_s: number };
  by_kind: { kind: string; usd: number; calls: number }[];
  by_provider: {
    provider: string;
    kind: string;
    usd: number;
    calls: number;
    tokens: number;
    seconds: number;
    chars: number;
  }[];
  by_model: { model: string; provider: string; usd: number; calls: number; tokens: number }[];
}

const money = (n: number, dp = 4) => `$${Number(n || 0).toFixed(dp)}`;
const num = (n: number) => Number(n || 0);

// Token-based palette so bars follow the theme (works in SVG fills).
const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 220 70% 55%))',
  'hsl(var(--chart-3, 160 60% 45%))',
  'hsl(var(--chart-4, 280 60% 60%))',
  'hsl(var(--chart-5, 40 90% 55%))',
  'hsl(var(--muted-foreground))',
];

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">{children}</div>
    </section>
  );
}

function CostBars({ rows }: { rows: { label: string; usd: number }[] }) {
  const data = [...rows].sort((a, b) => b.usd - a.usd);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={130}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number) => [money(v), 'cost']}
        />
        <Bar dataKey="usd" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CostAnalytics({ data }: { data: CostAnalyticsData }) {
  const providerTotals = Object.values(
    data.by_provider.reduce<Record<string, { label: string; usd: number }>>((acc, r) => {
      acc[r.provider] ??= { label: r.provider, usd: 0 };
      acc[r.provider].usd += num(r.usd);
      return acc;
    }, {})
  );
  const kindBars = data.by_kind.map((k) => ({ label: k.kind, usd: num(k.usd) }));
  const stt = data.by_provider.filter((r) => r.kind === 'stt');
  const brain = data.by_provider.filter((r) => r.kind === 'brain');

  // Head-to-head deltas for the two provider races we run (same workload, different provider).
  const cheaper = (rows: typeof stt) => {
    if (rows.length < 2) return null;
    const sorted = [...rows].sort((a, b) => num(a.usd) - num(b.usd));
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const pct = num(hi.usd) > 0 ? Math.round((1 - num(lo.usd) / num(hi.usd)) * 100) : 0;
    return { lo, hi, pct };
  };
  const sttWin = cheaper(stt);

  const dur = Math.round(num(data.per_interview.avg_duration_s));

  return (
    <div className="space-y-8">
      {/* Totals — the big-number row: whole cents at summary tier (dp=4 survives only in the
          per-model table below); readable from across the room. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          size="lg"
          label="Total spend"
          value={money(data.totals.total_usd, 2)}
          hint={`${data.totals.interviews} interviews`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          size="lg"
          label="Avg / interview"
          value={money(data.per_interview.avg_usd, 2)}
          hint="all services included"
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          size="lg"
          label="Most expensive"
          value={money(data.per_interview.max_usd, 2)}
          hint="single interview"
          icon={<Gauge className="h-4 w-4" />}
        />
        <MetricCard
          size="lg"
          label="Avg duration"
          value={`${Math.floor(dur / 60)}m ${dur % 60}s`}
          hint="per session"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cost by provider" subtitle="Total spend per vendor across all interviews">
          {providerTotals.length ? (
            <CostBars rows={providerTotals} />
          ) : (
            <Empty>No cost recorded yet.</Empty>
          )}
        </Panel>

        <Panel title="Cost by service" subtitle="brain · scorer · stt · tts · exec">
          {kindBars.length ? <CostBars rows={kindBars} /> : <Empty>No cost recorded yet.</Empty>}
        </Panel>
      </div>

      {/* Provider comparison — the cost/benefit call. */}
      <Panel
        title="Provider comparison"
        subtitle="Same workload, different provider — which to keep once the data is in"
      >
        <div className="space-y-6">
          <Compare
            label="Speech-to-text (same audio)"
            rows={stt.map((r) => ({
              provider: r.provider,
              usd: num(r.usd),
              unit: `${Math.round(num(r.seconds))}s`,
            }))}
            note={
              sttWin
                ? `${sttWin.lo.provider} is ~${sttWin.pct}% cheaper than ${sttWin.hi.provider} for the same audio.`
                : 'Run an interview with the shadow STT enabled to compare.'
            }
          />
          <Compare
            label="Brain / LLM (by provider)"
            rows={brain.map((r) => ({
              provider: r.provider,
              usd: num(r.usd),
              unit: `${num(r.tokens).toLocaleString()} tok`,
            }))}
            note="Fallback providers appear here as the chain uses them; compare $/token to pick a primary."
          />
        </div>
      </Panel>

      {/* By model */}
      <Panel title="By model" subtitle="Every model the oracle + scorer touched">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2">Model</th>
                <th className="pb-2">Provider</th>
                <th className="pb-2 text-right">Calls</th>
                <th className="pb-2 text-right">Tokens</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.by_model.length ? (
                data.by_model.map((m, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 font-medium text-foreground">{m.model}</td>
                    <td className="py-2 text-muted-foreground">{m.provider}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{num(m.calls)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {num(m.tokens).toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground">
                      {money(m.usd)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No model usage yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Compare({
  label,
  rows,
  note,
}: {
  label: string;
  rows: { provider: string; usd: number; unit: string }[];
  note: string;
}) {
  const max = Math.max(...rows.map((r) => r.usd), 0.000001);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {rows.length ? (
        <ul className="space-y-1.5">
          {[...rows]
            .sort((a, b) => a.usd - b.usd)
            .map((r, i) => (
              <li key={i} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 truncate text-muted-foreground">{r.provider}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-primary/70"
                    style={{ width: `${(r.usd / max) * 100}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono tabular-nums text-foreground">
                  {money(r.usd)}
                </span>
                <span className="w-20 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {r.unit}
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      )}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
