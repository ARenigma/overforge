'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Live spectating for the interviewer detail view. The page is a server component; this
 * client child re-renders it via router.refresh() whenever the candidate advances, so the
 * transcript / code / scorecard stream in without a manual refresh.
 *
 * Two mechanisms, belt-and-suspenders:
 *  - Supabase Realtime UPDATE on the interview row (instant). The socket is authenticated
 *    with the user's JWT so the owner-RLS policy delivers the event.
 *  - A 5s polling fallback so liveness is guaranteed even if Realtime is unavailable.
 *
 * Only active while the interview can still change.
 */
export function LiveRefresh({ interviewId, live }: { interviewId: string; live: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      // Authenticate the Realtime socket so RLS (auth.uid() = interviewer_id) delivers events.
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
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
    })();

    // Polling fallback — guarantees the view stays live even if Realtime is blocked.
    const poll = setInterval(() => router.refresh(), 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [interviewId, live, router]);

  if (!live) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-primary' : 'bg-primary/60'}`}
      />
      Live
    </span>
  );
}
