'use client';

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp, staggerContainer } from '@/lib/motion';

/* ── Inline SVG brand glyphs (~28px, monochrome currentColor or brand-tinted) ── */

function PythonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 2C10.13 2 7.5 3.84 7.5 6.5V9h6.5v1H5.5C3.02 10 1 12.02 1 14.5s2.02 4.5 4.5 4.5H7v2.5C7 24.16 9.63 26 13.5 26s6.5-1.84 6.5-4.5V19h-6.5v-1h8.5C24.02 18 26 15.98 26 13.5S24.02 9 21.5 9H20V6.5C20 3.84 17.37 2 14 2z"
        className="fill-[#3776AB]"
      />
      <path
        d="M14 2C17.37 2 20 3.84 20 6.5V9h-6.5v1h8.5C24.02 10 26 12.02 26 14.5S24.02 19 21.5 19H20v2.5C20 24.16 17.37 26 14 26s-6.5-1.84-6.5-4.5V19h6.5v-1H5.5C3.02 18 1 15.98 1 13.5S3.02 9 5.5 9H7V6.5C7 3.84 9.63 2 14 2z"
        className="fill-[#FFD43B]"
        opacity="0"
      />
      {/* simplified Python snake mark */}
      <circle cx="11" cy="7" r="1.2" fill="#FFD43B" />
      <circle cx="17" cy="21" r="1.2" fill="#3776AB" />
    </svg>
  );
}

function JavaScriptIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="3" className="fill-[#F7DF1E]" />
      <path
        d="M8.5 20.5c.6 1 1.4 1.7 2.8 1.7 1.2 0 2-.6 2-1.4 0-1-.8-1.3-2.1-1.9l-.7-.3c-2.1-.9-3.5-2-3.5-4.4 0-2.2 1.7-3.8 4.3-3.8 1.9 0 3.2.66 4.2 2.4l-2.3 1.5c-.5-.9-1-.97-1.9-.97-.83 0-1.37.52-1.37 1.2 0 .84.53 1.18 1.75 1.7l.7.3c2.47 1.06 3.9 2.14 3.9 4.57 0 2.62-2.06 4.02-4.82 4.02-2.7 0-4.44-1.29-5.3-2.97l2.37-1.37z"
        fill="#323330"
      />
      <path
        d="M17.5 10.5h2.7v7.9c0 2.3-.67 3.7-3.3 3.7-.8 0-1.6-.15-2.1-.45l.42-2.2c.36.17.8.28 1.2.28.73 0 1.08-.38 1.08-1.37V10.5z"
        fill="#323330"
      />
    </svg>
  );
}

function GoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M3 11.5c-.08 0-.1-.04-.06-.1l.42-.54c.04-.06.13-.1.21-.1h14.6c.08 0 .1.05.06.12l-.34.52c-.04.07-.13.12-.2.12L3 11.5z"
        fill="#00ACD7"
      />
      <path
        d="M.2 13.2c-.08 0-.1-.04-.06-.1l.42-.54c.04-.06.13-.1.21-.1h18.6c.08 0 .12.05.1.12l-.16.5c-.02.08-.1.13-.18.13L.2 13.2z"
        fill="#00ACD7"
      />
      <path
        d="M4.8 14.9c-.08 0-.1-.05-.06-.12l.28-.5c.04-.07.12-.12.2-.12h8.1c.08 0 .12.06.12.14l-.04.5c0 .08-.07.14-.14.14L4.8 14.9z"
        fill="#00ACD7"
      />
      <path
        d="M21.4 11.3c-.9-.23-1.5-.44-1.5-.98 0-.45.4-.75.98-.75.66 0 1.08.28 1.45.88l1.6-.98c-.62-1-1.6-1.47-3.05-1.47-1.74 0-3 .94-3 2.4 0 1.6 1.24 2.1 2.5 2.44 1.2.32 1.66.55 1.66 1.1 0 .5-.44.82-1.15.82-.82 0-1.4-.38-1.8-1.06l-1.64.96c.54 1.12 1.64 1.66 3.44 1.66 1.8 0 3.14-.9 3.14-2.56 0-1.64-1.2-2.16-2.63-2.5z"
        fill="#00ACD7"
      />
      <path
        d="M26 8.28h-1.97l-1.2 2.08-1.06-2.08H19.8l2.08 3.56L19.8 15.7H21.8l1.2-2.12 1.1 2.12H26l-2.1-3.56L26 8.28z"
        fill="#00ACD7"
      />
    </svg>
  );
}

function RustIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 2a12 12 0 1 0 0 24A12 12 0 0 0 14 2zm0 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21z"
        className="fill-foreground"
      />
      <path
        d="M7 13.5h1.5v-3H11a1.5 1.5 0 0 1 0 3h-1v1H11a2.5 2.5 0 0 0 0-5H7v7h1.5v-3z"
        className="fill-foreground"
      />
      <path d="M13.5 11h5v1.5h-1.75v4H15.25v-4H13.5V11z" className="fill-foreground" />
      <circle cx="14" cy="5.5" r="1" className="fill-foreground" />
      <circle cx="14" cy="22.5" r="1" className="fill-foreground" />
      <circle cx="5.5" cy="14" r="1" className="fill-foreground" />
      <circle cx="22.5" cy="14" r="1" className="fill-foreground" />
    </svg>
  );
}

function CppIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 2L3.46 7.5v13L14 26l10.54-5.5v-13L14 2z" fill="#00599C" />
      <path d="M14 2L3.46 7.5v13L14 26V2z" fill="#004482" />
      <path
        d="M19.5 15.25h-1v1h1v1h-1v1h-1v-1h-1v-1h1v-1h-1v-1h1v-1h-1V12h1v-1h1v1h1v1h-1v1h1v1zM14.5 15.25h-1v1h1v1h-1v1h-1v-1h-1v-1h1v-1h-1v-1h1v-1h-1V12h1v-1h1v1h1v1h-1v1h1v1z"
        fill="white"
      />
      <path
        d="M14 8.5c-3.04 0-5.5 2.46-5.5 5.5s2.46 5.5 5.5 5.5c1.85 0 3.48-.92 4.47-2.32L16.8 16c-.73.97-1.88 1.6-3.18 1.6a4.12 4.12 0 0 1 0-8.23c1.3 0 2.45.63 3.18 1.6l1.67-1.18A5.47 5.47 0 0 0 14 8.5z"
        fill="white"
      />
    </svg>
  );
}

function JavaIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M10.5 20.3s-.96.56.68.75c1.98.22 3 .19 5.2-.22 0 0 .58.36 1.38.67-4.9 2.1-11.1-.12-7.26-1.2z"
        fill="#5382A1"
      />
      <path
        d="M9.9 17.5s-1.08.8.57.97c2.13.22 3.8.24 6.7-.32 0 0 .4.41 1.04.63-5.94 1.74-12.56.14-8.3-1.28z"
        fill="#5382A1"
      />
      <path
        d="M15.3 12.6c1.2 1.38-.32 2.62-.32 2.62s3.07-1.58 1.66-3.56c-1.32-1.85-2.33-2.77 3.14-5.94 0 0-8.58 2.14-4.48 6.88z"
        fill="#E76F00"
      />
      <path
        d="M21.3 22.5s.71.59-.79.04c-2.86-1.1-11.9-1.42-14.37-.04-1.45.77.8-.48 1.73-.74 2.7-.74 10.05-1.18 13.43.74z"
        fill="#5382A1"
      />
      <path
        d="M11.1 14.2s-4.27 1.01-1.51 1.38c1.16.16 3.48.12 5.65-.06 1.77-.15 3.54-.47 3.54-.47s-.62.27-1.07.58c-4.3 1.13-12.6.6-10.2-.56 2.05-1 3.59-.87 3.59-.87z"
        fill="#5382A1"
      />
      <path
        d="M19.1 19.6c4.37-2.27 2.35-4.46 .94-4.16-.34.07-.5.14-.5.14s.13-.2.37-.29c2.78-1.28 4.92 2.88-.9 4.41 0 0 .07-.06.09-.1z"
        fill="#5382A1"
      />
      <path
        d="M16.4 3s2.44 2.44-2.32 6.2c-3.82 3.01-.87 4.72 0 6.68-2.22-2-3.85-3.76-2.75-5.4C12.9 8.05 17.4 6.89 16.4 3z"
        fill="#E76F00"
      />
      <path
        d="M11.8 25.3c4.2.27 10.64-.15 10.8-2.13 0 0-.29.76-3.47 1.36-3.6.68-8.04.6-10.68.16 0 0 .54.45 3.35.61z"
        fill="#5382A1"
      />
    </svg>
  );
}

function RubyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5.5 19.5l2-10 8-6 8 2-2 10-8 7-8-3z" fill="#CC342D" />
      <path d="M5.5 19.5l4.5-4.5L8 24l-2.5-4.5z" fill="#A31D1D" />
      <path d="M8 24l2-8.5 8.5-1-2.5 9-8 .5z" fill="#C73A2E" />
      <path d="M23.5 5.5l-5.5 9.5-1.5-9 7-0.5z" fill="#CC342D" />
      <path d="M23.5 5.5l-8 4L19 5l4.5.5z" fill="#A31D1D" />
      <path d="M5.5 9.5l4.5-4 9.5.5-4.5 5.5-9.5-2z" fill="#E36959" />
      <path d="M15.5 24l8-10-5.5 10h-2.5z" fill="#9B1C1C" />
    </svg>
  );
}

function TypeScriptIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="3" fill="#3178C6" />
      <path d="M15.5 14.75H18v-2.25h-7v2.25h2.5V22H15.5v-7.25z" fill="white" />
      <path
        d="M22 19.5c0 .5-.4 1-1.5 1-.8 0-1.5-.33-2-.85v2.3c.6.3 1.25.55 2 .55 2.3 0 3.5-1.2 3.5-2.8 0-2.6-3.5-2.5-3.5-3.7 0-.42.3-.8 1.1-.8.68 0 1.3.3 1.8.7v-2.2c-.52-.28-1.1-.45-1.8-.45-2.1 0-3.1 1.2-3.1 2.7 0 2.5 3.5 2.45 3.5 3.55z"
        fill="white"
      />
    </svg>
  );
}

const LANGUAGES = [
  { name: 'Python', ext: '.py', Icon: PythonIcon },
  { name: 'JavaScript', ext: '.js', Icon: JavaScriptIcon },
  { name: 'TypeScript', ext: '.ts', Icon: TypeScriptIcon },
  { name: 'Go', ext: '.go', Icon: GoIcon },
  { name: 'Rust', ext: '.rs', Icon: RustIcon },
  { name: 'C++', ext: '.cpp', Icon: CppIcon },
  { name: 'Java', ext: '.java', Icon: JavaIcon },
  { name: 'Ruby', ext: '.rb', Icon: RubyIcon },
] as const;

export function LanguageMatrix() {
  return (
    <Section id="languages">
      <SectionHeading
        lead="Interview in any language."
        tail="Real code, in the candidate's stack."
      />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8"
      >
        {LANGUAGES.map((lang) => {
          const { Icon } = lang;
          return (
            <motion.div
              key={lang.name}
              variants={fadeUp}
              className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-6 transition-all duration-200 hover:border-primary/50 hover:-translate-y-1 hover:bg-card/80 cursor-default select-none"
            >
              <div className="flex h-10 w-10 items-center justify-center">
                <Icon />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-medium text-foreground">{lang.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">{lang.ext}</span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </Section>
  );
}
