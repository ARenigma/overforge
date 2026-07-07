import { EditorialHeader, Section } from './section';
import { Reveal } from './reveal';
import { ProductFrame } from './frame';

/* The audit artifact — one REAL transition record, machine-readable, syntax-lit. Hand-tokenized
 * static JSX (zero highlight JS, zero deps — the whole block is server-rendered). The money line
 * rides as a comment, the way together.ai ships research as proof. */

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground-subtle">&quot;{children}&quot;</span>
);
const S = ({ children }: { children: React.ReactNode }) => (
  <span className="text-primary">&quot;{children}&quot;</span>
);
const N = ({ children }: { children: React.ReactNode }) => (
  <span className="text-success">{children}</span>
);

const LINES: React.ReactNode[] = [
  <span key={0} className="text-foreground-ghost">
    {'// same candidate, same answers → same score, every run'}
  </span>,
  <span key={1} className="text-foreground">
    {'{'}
  </span>,
  <>
    {'  '}
    <K>event</K>: <S>transition</S>,
  </>,
  <>
    {'  '}
    <K>from</K>: <S>coding</S>, <K>to</K>: <S>coding</S>,
  </>,
  <>
    {'  '}
    <K>trigger</K>: <S>run.failed</S>,
  </>,
  <>
    {'  '}
    <K>run</K>: {'{ '}
    <K>tests</K>: <S>5/8</S>, <K>verdict_ms</K>: <N>412</N>
    {' }'},
  </>,
  <>
    {'  '}
    <K>intervention</K>: {'{'}
  </>,
  <>
    {'    '}
    <K>kind</K>: <S>probe</S>, <K>strength</K>: <N>1</N>,
  </>,
  <>
    {'    '}
    <K>budget_left</K>: <N>1</N>, <K>spoiler</K>: <span className="text-destructive">false</span>
  </>,
  <>{'  },'}</>,
  <>
    {'  '}
    <K>ts</K>: <S>2026-07-07T14:03:11.402Z</S>
  </>,
  <span key={99} className="text-foreground">
    {'}'}
  </span>,
];

export function AuditArtifact() {
  return (
    <Section id="artifact">
      <EditorialHeader
        index="06"
        eyebrow="the artifact"
        lead="Machine-readable,"
        tail="lawyer-readable."
        sub="Every intervention is a record like this one — bounded, attributed, timestamped. Determinism isn't a slogan; it's a schema."
      />
      <Reveal className="mt-8">
        <ProductFrame className="mx-auto max-w-3xl">
          <div className="flex font-mono text-[12.5px] leading-[1.75]">
            <div className="select-none border-r border-border px-3 py-4 text-right text-foreground-ghost">
              {LINES.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* min-w-0: without it this flex item's auto min-width adopts the longest line and
                widens the page on phones instead of scrolling. */}
            <pre className="min-w-0 overflow-x-auto px-4 py-4">
              {LINES.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </pre>
          </div>
        </ProductFrame>
      </Reveal>
    </Section>
  );
}
