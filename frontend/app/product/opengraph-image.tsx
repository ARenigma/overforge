import { ogImage, OG_SIZE } from '@/lib/og';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Finite product — six modules, one deterministic interviewer.';

export default function Image() {
  return ogImage({
    eyebrow: 'product',
    line1: 'Six modules.',
    line2: 'One deterministic interviewer',
    sub: 'FSM core · voice pipeline · gVisor sandbox · scorer · proctor · telemetry.',
  });
}
