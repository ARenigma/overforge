'use client';

const TECH = [
  'Supabase',
  'Docker',
  'Vercel',
  'Postgres',
  'Resend',
  'Next.js',
  'MiniMax',
  'GitHub',
] as const;

/** Infinite CSS marquee strip — no JS lib. Duplicated list gives seamless loop. */
export function Marquee() {
  return (
    <div className="border-y border-border">
      <div className="py-6">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Built on infrastructure you already trust
        </p>
        <div className="overflow-hidden">
          <div className="flex w-max animate-marquee gap-16 whitespace-nowrap" aria-hidden="true">
            {[...TECH, ...TECH].map((name, i) => (
              <span
                key={i}
                className="font-mono text-sm font-medium uppercase tracking-widest text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
