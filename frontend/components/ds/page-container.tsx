import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page Container fragment (Supabase design-system "Page Container"): the centered, padded
 * column that page content sits in. One source of truth for max-width + gutters.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-[1200px] px-6 py-10 sm:px-8', className)}>{children}</div>
  );
}

/** Page Section fragment (Supabase design-system "Page Section"): a spaced content block. */
export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mb-8', className)}>{children}</section>;
}
