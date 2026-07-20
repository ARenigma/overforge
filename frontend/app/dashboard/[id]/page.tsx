import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Wordmark } from '@/components/marketing/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '../_components/sign-out-button';
import { LiveInterview } from '../_components/live-interview';
import { INTERVIEW_DETAIL_COLUMNS, type InterviewDetail } from '@/lib/interview-detail';
import { PageContainer } from '@/components/ds/page-container';

export default async function InterviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // RLS scopes this read to the signed-in interviewer's own rows; anything else 404s.
  const { data, error } = await supabase
    .from('interviews')
    .select(INTERVIEW_DETAIL_COLUMNS)
    .eq('id', params.id)
    .single();

  // A Supabase error means a DB/network problem — throw so the error boundary renders.
  // Only call notFound() when the query succeeded but returned no row (genuinely missing).
  if (error) throw new Error(`Failed to load interview: ${error.message}`);
  if (!data) notFound();
  const iv = data as unknown as InterviewDetail;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Link
            href="/"
            aria-label="Overforge — home"
            className="transition-opacity hover:opacity-80"
          >
            <Wordmark />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main>
        <PageContainer>
          <Link
            href="/dashboard"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Interviews
          </Link>

          <LiveInterview initial={iv} />
        </PageContainer>
      </main>
    </div>
  );
}
