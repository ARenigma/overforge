import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Section, EditorialHeader, SectionDivider } from '@/components/marketing/section';
import { Reveal } from '@/components/marketing/reveal';
import { CTA } from '@/components/marketing/cta';

export const metadata: Metadata = {
  title: 'About — Finite',
  description:
    'Finite builds an autonomous technical interviewer: deterministic, sandboxed, auditable. Why we think the first-round screen should be a machine.',
};

const BELIEFS = [
  {
    k: 'determinism',
    title: 'Consistency beats intuition',
    body: 'The same question, the same rubric, every candidate. No mood-of-the-day variation — a scorecard you can defend to a candidate, or a court.',
  },
  {
    k: 'respect',
    title: 'Candidates deserve a real interview',
    body: 'A good screen challenges fairly, answers clarifying questions, offers help before hints, and never nags. That is what we build — and measure.',
  },
  {
    k: 'evidence',
    title: 'Scores must be explainable',
    body: 'Every session leaves a transition ledger — each question, run, probe and score, timestamped. The rubric maps to explicit criteria, not vibes.',
  },
  {
    k: 'custody',
    title: 'Data stays with you',
    body: 'Candidate sessions belong to your organisation, isolated per interview. We do not train general-purpose models on them without explicit consent.',
  },
];

export default function AboutPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Editorial hero. */}
      <section className="mx-auto max-w-6xl px-6 pb-6 pt-36 sm:pt-40">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">about</span> — why a machine
        </p>
        <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          <span className="text-foreground">The first-round screen</span>{' '}
          <span className="text-foreground-subtle">should be deterministic.</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
          First-round technical screens are expensive to run well and easy to run badly. An hour of
          engineer time per candidate, inconsistent questions, scheduling friction that loses good
          people. We built a machine that fixes all three — and shows its work.
        </p>
      </section>

      {/* The honest AI section — prose, no hype. */}
      <Section>
        <EditorialHeader
          index="01"
          eyebrow="how it actually works"
          lead="Not a chatbot with a checklist."
          sub="A finite-state machine owns the interview; a language model words the questions and judges the substance of answers."
        />
        {/* Boxless: the story-tab-at-rest device — hairline top rule + mono key, no cards. */}
        <Reveal className="mt-10 grid gap-x-8 gap-y-8 lg:grid-cols-3">
          <div className="border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">listen</p>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              The interviewer evaluates substance — reasoning quality, edge-case awareness, accuracy
              — and generates each follow-up from the answer just given. A clarifying question gets
              an answer, not a state transition.
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">run</p>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              The coding round executes for real in an isolated sandbox, graded against hidden
              tests. The scorer sees the code and its output — nobody talks around a bug they never
              fixed.
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">decide</p>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              Scores are decision-support, not decisions. The scorecard shows what was said and how
              it mapped to your rubric — your team makes the hiring call.
            </p>
          </div>
        </Reveal>
      </Section>

      <SectionDivider />

      {/* Beliefs — the spec-key register. */}
      <Section>
        <EditorialHeader
          index="02"
          eyebrow="what we believe"
          lead="Four principles,"
          tail="engineered in."
        />
        <Reveal className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
          {BELIEFS.map((b) => (
            <div key={b.k} className="border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                {b.k}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{b.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </Reveal>
      </Section>

      <SectionDivider />

      {/* Company — factual, no placeholders. */}
      <Section>
        <EditorialHeader
          index="03"
          eyebrow="the company"
          lead="Narrow problem,"
          tail="on purpose."
        />
        <Reveal>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            Finite is a privately held company focused on one thing: making the first-round
            technical screen rigorous, consistent, and fast. We are not replacing your senior
            engineers&apos; judgment or the culture conversation — we are making the repetitive
            first screen worth everyone&apos;s time, including the candidate&apos;s.
          </p>
        </Reveal>
      </Section>

      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
