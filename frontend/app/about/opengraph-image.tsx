import { ogImage, OG_SIZE } from '@/lib/og';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'About Finite — why the first-round screen should be deterministic.';

export default function Image() {
  return ogImage({
    eyebrow: 'about',
    line1: 'The first-round screen',
    line2: 'should be deterministic',
    sub: 'Consistency beats intuition. Scores must be explainable. Data stays with you.',
  });
}
