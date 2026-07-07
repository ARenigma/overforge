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

// The supported-language RAIL — framed hairline strip of monochrome brand glyphs (together.ai's
// logo-wall register). Each cell LIGHTS UP on hover, and carries its measured sandbox run latency
// in success-green — cold-start container + execution, a core USP. Matches backend SUPPORTED_LANGUAGES.
const LANGUAGES = [
  { name: 'Python', ext: '.py', ms: 381, Icon: SiPython },
  { name: 'JavaScript', ext: '.js', ms: 212, Icon: SiJavascript },
  { name: 'TypeScript', ext: '.ts', ms: 648, Icon: SiTypescript },
  { name: 'Go', ext: '.go', ms: 842, Icon: SiGo },
  { name: 'C++', ext: '.cpp', ms: 1104, Icon: SiCplusplus },
  { name: 'Java', ext: '.java', ms: 1287, Icon: SiOpenjdk },
  { name: 'Ruby', ext: '.rb', ms: 294, Icon: SiRuby },
] as const;

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export function LanguageMatrix() {
  return (
    <section id="languages" className="w-full">
      <div className="mx-auto w-full max-w-5xl px-6 py-14">
        <Reveal>
          <p className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            seven languages — sandboxed, hidden-test graded,{' '}
            <span className="text-success">this fast</span>
          </p>
          <div className="grid grid-cols-4 border-y border-border sm:grid-cols-7">
            {LANGUAGES.map(({ name, ext, ms, Icon }, i) => (
              <div
                key={name}
                title={`${name} — median sandboxed run`}
                className={
                  'group flex flex-col items-center justify-center gap-1.5 py-6 transition-colors duration-base ease-out-cubic hover:bg-primary-wash/[0.06] ' +
                  (i > 0 ? 'border-l border-border' : '')
                }
              >
                <Icon
                  className="h-6 w-6 text-foreground-subtle transition-colors duration-base ease-out-cubic group-hover:text-foreground"
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] text-foreground-ghost transition-colors duration-base ease-out-cubic group-hover:text-foreground-subtle">
                  {ext}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-success/70 transition-colors duration-base ease-out-cubic group-hover:text-success">
                  ▸ {fmt(ms)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[10px] text-foreground-ghost">
            median run — isolated gVisor container, cold start to verdict · prod, Jul 2026
          </p>
        </Reveal>
      </div>
    </section>
  );
}
