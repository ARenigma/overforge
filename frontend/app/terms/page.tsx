// LEGAL NOTE: The terms of service copy below is a template scaffold pending formal legal review.
// Before launching publicly, have a qualified attorney review and approve this document.
// Replace all [PLACEHOLDER] values with your actual information.

import type { Metadata } from 'next';
import { PillNav } from '@/components/marketing/pill-nav';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Terms of Service — Overforge',
  description: 'The terms governing your use of the Overforge AI interview platform.',
};

const LAST_UPDATED = 'June 2025';

export default function TermsPage() {
  return (
    <main className="relative">
      <PillNav />

      <section className="mx-auto max-w-3xl px-6 pb-4 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">Terms of</span>{' '}
          <span className="text-muted-foreground">Service</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mx-auto mt-2 max-w-xl rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
          Template — pending legal review. Not yet a legally effective document.
        </p>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <ProseSection heading="1. Acceptance of Terms">
          <p>
            By accessing or using the Overforge platform (&ldquo;Service&rdquo;), you agree to be
            bound by these Terms of Service. If you are using the Service on behalf of an
            organisation, you represent that you have authority to bind that organisation.
          </p>
          <p className="mt-3">If you do not agree to these terms, do not use the Service.</p>
        </ProseSection>

        <ProseSection heading="2. Description of Service">
          <p>
            Overforge provides an AI-powered technical interview platform that enables organisations
            (&ldquo;Customers&rdquo;) to conduct asynchronous or live technical interviews with
            candidates. The Service includes a spoken AI interviewer, a sandboxed code execution
            environment, and deterministic scoring against rubrics defined by the Customer.
          </p>
        </ProseSection>

        <ProseSection heading="3. Accounts">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              You are responsible for maintaining the confidentiality of your account credentials.
            </li>
            <li>You must provide accurate information when creating an account.</li>
            <li>
              You may not share account access with individuals outside your organisation without
              our prior written consent.
            </li>
            <li>You are responsible for all activity that occurs under your account.</li>
          </ul>
        </ProseSection>

        <ProseSection heading="4. Acceptable Use">
          <p>You agree not to use the Service to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Conduct interviews that violate applicable employment discrimination laws in your
              jurisdiction
            </li>
            <li>Collect candidate data for purposes other than the stated interview</li>
            <li>Attempt to reverse-engineer, circumvent, or tamper with the AI scoring system</li>
            <li>Upload malicious code or attempt to escape the sandboxed execution environment</li>
            <li>Resell or sublicense access to the Service without a separate written agreement</li>
            <li>Use the Service in any way that violates applicable law</li>
          </ul>
        </ProseSection>

        <ProseSection heading="5. Candidate Sessions">
          <p>
            Customers are solely responsible for obtaining any required consents from candidates
            prior to initiating an interview session, including consent to audio recording where
            required by law. Overforge provides the technical infrastructure; the legal relationship
            with the candidate is between the Customer and the candidate.
          </p>
          <p className="mt-3">
            Candidates invited to a session by a Customer agree to the recording and automated
            evaluation of their responses solely for the purpose of that interview. Candidates may
            request deletion of their session data by contacting the Customer that invited them.
          </p>
        </ProseSection>

        <ProseSection heading="6. Intellectual Property">
          <p>
            Overforge retains all rights in the Service, including the AI models, scoring
            algorithms, platform infrastructure, and UI. Customers retain all rights in their
            question sets, rubrics, and candidate data.
          </p>
          <p className="mt-3">
            By submitting content to the Service (e.g. interview questions), you grant Overforge a
            limited licence to use that content solely to operate and improve the Service.
          </p>
        </ProseSection>

        <ProseSection heading="7. Fees and Payment">
          <p>
            Subscription fees are billed in advance on a monthly or annual basis as selected at
            sign-up. All fees are non-refundable except as required by law or as described in our
            refund policy. We reserve the right to modify pricing with 30 days&apos; written notice
            to existing customers.
          </p>
        </ProseSection>

        <ProseSection heading="8. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, Overforge shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use
            of the Service, including but not limited to loss of revenue, loss of data, or hiring
            decisions made on the basis of AI-generated scores.
          </p>
          <p className="mt-3">
            AI-generated scorecards are decision-support tools, not binding assessments. Customers
            are responsible for all final hiring decisions and for ensuring those decisions comply
            with applicable employment law.
          </p>
        </ProseSection>

        <ProseSection heading="9. Termination">
          <p>
            Either party may terminate the Service agreement at the end of the current billing
            period by providing written notice. We reserve the right to suspend or terminate
            accounts that violate these Terms immediately and without refund.
          </p>
          <p className="mt-3">
            Upon termination, your access to the Service will cease and your data will be retained
            for 90 days before deletion, during which you may export it.
          </p>
        </ProseSection>

        <ProseSection heading="10. Changes to These Terms">
          <p>
            We may update these Terms at any time. Material changes will be communicated by email to
            account holders at least 14 days before taking effect. Continued use of the Service
            after the effective date constitutes acceptance of the revised Terms.
          </p>
        </ProseSection>

        <ProseSection heading="11. Governing Law">
          <p>
            {/* TODO: specify jurisdiction — e.g. "These Terms are governed by the laws of [State/Country]." */}
            These Terms are governed by the laws of the jurisdiction in which Overforge is
            incorporated. Any disputes shall be resolved in the courts of that jurisdiction.
          </p>
        </ProseSection>

        <ProseSection heading="12. Contact">
          <p>
            Questions about these Terms:{' '}
            <a href="mailto:legal@overforge.ai" className="text-primary hover:underline">
              legal@overforge.ai
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
