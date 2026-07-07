import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* The Finite control voice: uppercase mono micro-type. Every marketing CTA speaks in the same
 * register as the transition ledger — machine labels, not sentence-case buttons. */

export function Cta({
  href,
  children,
  variant = 'primary',
  arrow = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'outline';
  arrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex h-11 items-center gap-2 rounded-md px-6 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-fast ease-out-cubic',
        variant === 'primary'
          ? 'bg-primary text-primary-foreground hover:opacity-90 transition-opacity'
          : 'border border-border text-foreground hover:bg-accent',
        className
      )}
    >
      {children}
      {arrow && (
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-fast ease-out-cubic group-hover:translate-x-0.5" />
      )}
    </Link>
  );
}
