'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ds/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { rescoreInterview } from '@/lib/api';

/** Re-run scoring for an interview (recovers a stuck one / retries a failed scorecard). */
export function RescoreButton({
  interviewId,
  hasScore,
}: {
  interviewId: string;
  hasScore: boolean;
}) {
  const router = useRouter();

  async function doRescore() {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    await rescoreInterview(session.access_token, interviewId);
    router.refresh();
  }

  return (
    <ConfirmDialog
      title={hasScore ? 'Re-score this interview?' : 'Score this interview?'}
      description="This re-runs the AI grader over the transcript and code, overwrites any existing scorecard, and emails the result."
      confirmLabel={hasScore ? 'Re-score' : 'Score now'}
      onConfirm={doRescore}
      trigger={
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          {hasScore ? 'Re-score' : 'Score now'}
        </Button>
      }
    />
  );
}
