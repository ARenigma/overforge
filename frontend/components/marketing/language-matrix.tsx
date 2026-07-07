import {
  SiPython,
  SiJavascript,
  SiTypescript,
  SiGo,
  SiCplusplus,
  SiRuby,
  SiOpenjdk,
} from 'react-icons/si';
import { Reveal } from '@/components/marketing/reveal';

// The supported-language RAIL — a framed hairline strip of monochrome brand glyphs (together.ai's
// logo-wall register), not a grid of hover-bouncing cards. Matches the backend's SUPPORTED_LANGUAGES.
const LANGUAGES = [
  { name: 'Python', ext: '.py', Icon: SiPython },
  { name: 'JavaScript', ext: '.js', Icon: SiJavascript },
  { name: 'TypeScript', ext: '.ts', Icon: SiTypescript },
  { name: 'Go', ext: '.go', Icon: SiGo },
  { name: 'C++', ext: '.cpp', Icon: SiCplusplus },
  { name: 'Java', ext: '.java', Icon: SiOpenjdk },
  { name: 'Ruby', ext: '.rb', Icon: SiRuby },
] as const;

export function LanguageMatrix() {
  return (
    <section id="languages" className="w-full">
      <div className="mx-auto w-full max-w-5xl px-6 py-14">
        <Reveal>
          <p className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            seven languages — sandboxed, hidden-test graded
          </p>
          <div className="grid grid-cols-4 border-y border-border sm:grid-cols-7">
            {LANGUAGES.map(({ name, ext, Icon }, i) => (
              <div
                key={name}
                title={name}
                className={
                  'flex flex-col items-center justify-center gap-2 py-6 opacity-70 transition-opacity duration-base ease-out-cubic hover:opacity-100 ' +
                  (i > 0 ? 'border-l border-border' : '')
                }
              >
                <Icon className="h-6 w-6 text-foreground" aria-hidden="true" />
                <span className="font-mono text-[10px] text-foreground-subtle">{ext}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
