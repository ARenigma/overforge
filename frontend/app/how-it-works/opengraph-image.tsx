import { ogImage, OG_SIZE } from '@/lib/og';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'How Finite works — from invite to scorecard, one auditable path.';

export default function Image() {
  return ogImage({
    eyebrow: 'how it works',
    line1: 'From invite to scorecard,',
    line2: 'one auditable path',
    sub: 'The interview is a finite-state machine — real screens, real latencies, real receipts.',
  });
}
