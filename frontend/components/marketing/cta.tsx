import { Section } from './section';
import { Cta } from './controls';
import { Reveal } from './reveal';
import { BookDemo } from './book-demo';

/** Closing bookend — the hero headline with the emphasis INVERTED ("Infinite candidates." now
 *  carries the ink), restated at the exit. The page ends where it began: at the terminal state. */
export function CTA() {
  return (
    <Section id="end">
      <Reveal className="py-10 text-center sm:py-16">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">06</span> — state: end
        </p>
        <h2 className="text-balance text-4xl font-medium leading-[1.02] tracking-[-0.02em] sm:text-6xl">
          <span className="text-foreground">Infinite candidates.</span>
          <br />
          <span className="text-foreground-subtle">
            Finite answers<span className="text-primary">.</span>
          </span>
        </h2>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Cta href="/auth" arrow>
            Run an interview
          </Cta>
          <BookDemo />
          <Cta href="/pricing" variant="outline">
            See pricing
          </Cta>
        </div>
      </Reveal>
    </Section>
  );
}
