'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Live spectating: subscribes to Supabase Realtime UPDATE events on this interview row and
 * re-renders the (server-component) detail page via router.refresh() when the candidate
 * advances — transcript, code, and scorecard stream in without a manual refresh. Shows a
 * LIVE indicator. Only active while the interview can still change.
 */
export function LiveRefresh({ interviewId, live }: { interviewId: string; live: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`interview-${interviewId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'interviews',
          filter: `id=eq.${interviewId}`,
        },
        () => router.refresh()
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [interviewId, live, router]);

  if (!live) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-primary' : 'bg-muted-foreground/40'}`}
      />
      {connected ? 'Live' : 'Connecting…'}
    </span>
  );
}
