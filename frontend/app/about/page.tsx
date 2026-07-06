// TODO (owner): Fill in company-specific details marked [TODO] before publishing.
// The mission copy is accurate; founding story, team, and traction numbers need real values.

import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Section, SectionHeading, SectionDivider } from '@/components/marketing/section';
import { CTA } from '@/components/marketing/cta';

export const metadata: Metadata = {
  title: 'About — Finite',
  description:
    'Finite builds autonomous AI technical interviews that eliminate scheduling overhead and evaluate every candidate against the same deterministic rubric.',
};

export default function AboutPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 pb-4 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">Built to make</span>{' '}
          <span className="text-muted-foreground">hiring fairer and faster.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Finite is an AI technical interview platform that runs the first-round screen for
          engineering roles — so your team only meets candidates who have already demonstrated they
          can do the work.
        </p>
      </section>

      {/* Mission */}
      <Section tone="base">
        <SectionHeading
          lead="The problem we're solving."
          align="left"
          sub="First-round technical screens are expensive to run well and easy to run badly. A 60-minute engineer interview costs real money. Inconsistent questions mean inconsistent signals. Scheduling friction means good candidates drop out. Finite fixes all three."
        />

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            {
              stat: 'No scheduling',
              description:
                'Candidates complete their interview on their schedule — no back-and-forth, no dropped Zooms.',
            },
            {
              stat: 'Same rubric, every time',
              description:
                'Every candidate is evaluated against the same question set and scoring rubric defined by your team.',
            },
            {
              stat: 'Real code, real output',
              description:
                'A sandboxed IDE executes candidate code in the language of your choice. No whiteboard syntax.',
            },
          ].map(({ stat, description }) => (
            <div key={stat} className="rounded-xl border border-border bg-card p-6">
              <p className="text-lg font-semibold text-foreground">{stat}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How the AI works — honest, no hype */}
      <Section tone="recessed">
        <SectionHeading
          lead="How the AI interviewer works."
          align="left"
          sub="Finite uses a large language model to conduct a spoken technical interview. It asks questions, listens, follows up based on the candidate's answers, and scores responses against a rubric you control."
        />

        <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            The interviewer is not a chatbot that checks keywords. It evaluates substance: reasoning
            quality, edge-case awareness, and the accuracy of the explanation. Scoring is
            deterministic — the rubric maps to explicit criteria, not vibes.
          </p>
          <p>
            The coding round runs in a real sandboxed environment. Code is executed. Output is
            captured. The AI sees both the code and the output when scoring, so a candidate cannot
            talk around a bug they did not fix.
          </p>
          <p>
            AI scores are decision-support, not decisions. The scorecard tells you what a candidate
            said and how it mapped to your rubric. Your team makes the hiring call.
          </p>
        </div>
      </Section>

      {/* Company — honest placeholders */}
      <Section tone="base">
        <SectionHeading lead="The company." align="left" />

        <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          {/* TODO: Replace the paragraph below with your real founding story */}
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-foreground-subtle">
            [TODO — founding story: who started Finite, when, and why. Keep it factual.]
          </p>

          <p>
            Finite is a privately held company.{' '}
            {/* TODO: Add incorporation jurisdiction, e.g. "incorporated in Delaware" */}
          </p>

          <p>
            We are focused on a narrow problem: making first-round technical screening rigorous,
            consistent, and fast for engineering hiring teams. We are not trying to replace human
            interviewers for senior or culture-fit rounds — we are trying to make the repetitive
            first screen worth everyone&apos;s time.
          </p>

          {/* TODO: Add team section when you are ready to name founders/key hires */}
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-foreground-subtle">
            [TODO — team: names and roles of founders/key team members.]
          </p>
        </div>
      </Section>

      {/* Values — factual, no fluff */}
      <Section tone="recessed">
        <SectionHeading lead="What we believe." align="left" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {[
            {
              title: 'Consistency beats intuition',
              body: 'The same question, the same rubric, every candidate. No mood-of-the-day variation.',
            },
            {
              title: 'Candidates deserve respect',
              body: "A good technical screen challenges a candidate fairly and gives them a clear signal. That's what we build.",
            },
            {
              title: 'Scores must be explainable',
              body: 'Every scorecard maps to explicit rubric criteria. You can always show a candidate — or a lawyer — exactly why they scored what they scored.',
            },
            {
              title: 'Data stays with you',
              body: 'Candidate session data belongs to your organisation. We do not use it to train general-purpose models without your explicit consent.',
            },
          ].map(({ title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <p className="font-medium text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <CTA />
      <SectionDivider />
      <Footer />
    </main>
  );
}
