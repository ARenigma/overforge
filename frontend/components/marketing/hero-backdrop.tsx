'use client';

import dynamic from 'next/dynamic';

// Lazy + client-only so three.js stays out of the SSR/app bundle and only the
// marketing route pays for it.
const DottedSurface = dynamic(
  () => import('@/components/ui/dotted-surface').then((m) => m.DottedSurface),
  { ssr: false }
);

export function HeroBackdrop() {
  return <DottedSurface />;
}
