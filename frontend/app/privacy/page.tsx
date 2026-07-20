// LEGAL NOTE: The privacy policy copy below is a template scaffold pending formal legal review.
// Before launching publicly, have a qualified attorney review and approve this document.
// Replace all [PLACEHOLDER] values with your actual information.

import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Privacy Policy — Finite',
  description:
    'How Finite collects, uses, and protects your data as a recruiter or interview candidate.',
};

const LAST_UPDATED = 'June 2025';

export default function PrivacyPage() {
  return (
    <main className="relative">
      <SiteNav />

      <section className="mx-auto max-w-3xl px-6 pb-4 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">Privacy</span>{' '}
          <span className="text-muted-foreground">Policy</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mx-auto mt-2 max-w-xl rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
          Template — pending legal review. Not yet a legally effective document.
        </p>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <ProseSection heading="1. Who We Are">
          <p>
            Finite (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the Finite
            platform at overforge.ai, which provides AI-powered technical interview infrastructure
            for recruiters and engineering hiring teams.
          </p>
          <p className="mt-3">
            Contact:{' '}
            <a href="mailto:privacy@overforge.ai" className="text-primary hover:underline">
              privacy@overforge.ai
            </a>
          </p>
        </ProseSection>

        <ProseSection heading="2. Data We Collect">
          <p className="font-medium text-foreground">Recruiter / company accounts:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Email address and name (via account sign-up or OAuth)</li>
            <li>Organisation name and billing information</li>
            <li>Interview room configurations and question sets</li>
            <li>Usage telemetry (page views, feature interactions)</li>
          </ul>

          <p className="mt-4 font-medium text-foreground">Candidate sessions:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Audio recordings of spoken responses (processed in real-time; see retention below)
            </li>
            <li>Code written in the in-browser IDE</li>
            <li>Execution outputs from the sandboxed code runner</li>
            <li>AI-generated scores and rubric evaluations</li>
          </ul>
        </ProseSection>

        <ProseSection heading="3. How We Use Your Data">
          <ul className="list-disc space-y-1 pl-5">
            <li>To operate and deliver the interview platform to your organisation</li>
            <li>To generate deterministic scorecards for each candidate session</li>
            <li>
              To improve reliability and accuracy of AI evaluation models (aggregated,
              de-identified)
            </li>
            <li>To communicate account and billing information</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p className="mt-3">
            We do not sell candidate data to third parties. We do not use candidate audio or code to
            train general-purpose AI models without explicit written consent from your organisation.
          </p>
        </ProseSection>

        <ProseSection heading="4. Third-Party Sub-Processors">
          <p>We use the following sub-processors to deliver the service:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-foreground">Supabase</span> — authentication and
              primary database (PostgreSQL, hosted on AWS)
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel</span> — frontend hosting and
              edge functions
            </li>
            <li>
              <span className="font-medium text-foreground">AssemblyAI</span> — real-time
              speech-to-text transcription of candidate audio
            </li>
            <li>
              <span className="font-medium text-foreground">Soniox</span> — secondary speech-to-text
              used for transcription-quality evaluation
            </li>
            <li>
              <span className="font-medium text-foreground">Cartesia</span> — text-to-speech for the
              AI interviewer voice
            </li>
            <li>
              <span className="font-medium text-foreground">MiniMax</span> — large language model
              inference on interview responses
            </li>
            <li>
              <span className="font-medium text-foreground">Groq</span> — large language model
              inference on interview responses
            </li>
            <li>
              <span className="font-medium text-foreground">Cerebras</span> — large language model
              inference (fallback)
            </li>
            <li>
              <span className="font-medium text-foreground">Resend</span> — transactional email
              delivery of candidate result notifications
            </li>
            <li>
              <span className="font-medium text-foreground">Sentry</span> — error monitoring; may
              process request metadata
            </li>
          </ul>
          <p className="mt-3">
            Each sub-processor is contractually bound to data protection standards consistent with
            applicable law.
          </p>
        </ProseSection>

        <ProseSection heading="5. Candidate Data Isolation">
          <p>
            Each interview session runs in an isolated environment. Candidate audio, code, and
            outputs are logically separated per session and per organisation. No candidate can
            access another candidate&apos;s data.
          </p>
          <p className="mt-3">
            Code execution occurs in a sandboxed environment with no outbound network access,
            preventing exfiltration of organisation data during an interview.
          </p>
        </ProseSection>

        <ProseSection heading="6. Data Retention">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-foreground">Audio recordings:</span> Processed in
              real-time for transcription; raw audio is deleted within 24 hours of session
              completion unless your organisation has enabled extended retention.
            </li>
            <li>
              <span className="font-medium text-foreground">Scorecards and transcripts:</span>{' '}
              Retained for 90 days after the interview, then permanently deleted.
            </li>
            <li>
              <span className="font-medium text-foreground">Account data:</span> Retained until
              account deletion. Deleted within 30 days of a verified deletion request.
            </li>
          </ul>
        </ProseSection>

        <ProseSection heading="7. Your Rights">
          <p>
            Depending on your jurisdiction, you may have rights to access, correct, delete, or port
            your personal data. To exercise any of these rights, contact{' '}
            <a href="mailto:privacy@overforge.ai" className="text-primary hover:underline">
              privacy@overforge.ai
            </a>
            .
          </p>
          <p className="mt-3">
            For candidates: your data is controlled by the organisation that invited you to the
            interview. Please contact that organisation to exercise rights over your candidate
            session data.
          </p>
        </ProseSection>

        <ProseSection heading="8. Security">
          <p>
            All data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Access to production
            data is restricted to authorised personnel only, with audit logging enabled.
          </p>
        </ProseSection>

        <ProseSection heading="9. Changes to This Policy">
          <p>
            We will post changes to this page with an updated &ldquo;Last updated&rdquo; date. For
            material changes, we will notify account holders by email at least 14 days before the
            change takes effect.
          </p>
        </ProseSection>

        <ProseSection heading="10. Contact">
          <p>
            Questions about this policy:{' '}
            <a href="mailto:privacy@overforge.ai" className="text-primary hover:underline">
              privacy@overforge.ai
            </a>
          </p>
        </ProseSection>
      </div>

      <SectionDivider />
      <Footer />
    </main>
  );
}

function ProseSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
