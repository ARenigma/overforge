import Link from 'next/link';
import { Section } from './section';

export function CTA() {
  return (
    <Section>
      <div className="overflow-hidden rounded-2xl border border-border bg-card px-8 py-16 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="text-foreground">Start screening</span>{' '}
          <span className="text-primary">in minutes.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Create your first AI interview and send the link today.
        </p>
        <Link
          href="/auth"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          Start free
        </Link>
      </div>
    </Section>
  );
}
