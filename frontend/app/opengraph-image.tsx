import { ogImage, OG_SIZE } from '@/lib/og';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Finite — Infinite candidates. Finite answers.';

export default function Image() {
  return ogImage({
    eyebrow: 'autonomous technical interviewer',
    line1: 'Infinite candidates.',
    line2: 'Finite answers',
    sub: 'A first-round technical screen run end to end by a finite-state machine.',
  });
}
