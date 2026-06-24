import {
  SiPython,
  SiJavascript,
  SiTypescript,
  SiGo,
  SiRust,
  SiCplusplus,
  SiRuby,
  SiOpenjdk,
} from 'react-icons/si';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';

// Accurate brand glyphs from Simple Icons (react-icons/si) — rendered monochrome,
// lighting up to the brand green on hover (Supabase-style logo wall).
const LANGUAGES = [
  { name: 'Python', ext: '.py', Icon: SiPython },
  { name: 'JavaScript', ext: '.js', Icon: SiJavascript },
  { name: 'TypeScript', ext: '.ts', Icon: SiTypescript },
  { name: 'Go', ext: '.go', Icon: SiGo },
  { name: 'Rust', ext: '.rs', Icon: SiRust },
  { name: 'C++', ext: '.cpp', Icon: SiCplusplus },
  { name: 'Java', ext: '.java', Icon: SiOpenjdk },
  { name: 'Ruby', ext: '.rb', Icon: SiRuby },
] as const;

export function LanguageMatrix() {
  return (
    <Section id="languages" tone="recessed">
      <SectionHeading
        lead="Interview in any language."
        tail="Real code, in the candidate's stack."
      />
      <Reveal className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {LANGUAGES.map((lang) => {
          const { Icon } = lang;
          return (
            <div
              key={lang.name}
              className="group flex aspect-square cursor-default select-none flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-accent/30"
            >
              <Icon
                className="h-7 w-7 text-foreground-subtle transition-all duration-200 group-hover:scale-110 group-hover:text-primary"
                aria-hidden="true"
              />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-medium text-foreground">{lang.name}</span>
                <span className="font-mono text-[10px] text-foreground-subtle">{lang.ext}</span>
              </div>
            </div>
          );
        })}
      </Reveal>
    </Section>
  );
}
