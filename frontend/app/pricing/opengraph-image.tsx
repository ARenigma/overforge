import { ogImage, OG_SIZE } from '@/lib/og';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Finite pricing — cost, computed. Not "from $X".';

export default function Image() {
  return ogImage({
    eyebrow: 'pricing',
    line1: 'Cost, computed.',
    line2: 'Not “from $X”',
    sub: 'Per-interview units on a volume ladder — engineer time returned, in green.',
  });
}
