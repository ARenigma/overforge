'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { ConfirmDialog } from '@/components/ds/confirm-dialog';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <ConfirmDialog
      title="Sign out?"
      description="You'll need to sign in again to access your dashboard."
      confirmLabel="Sign out"
      onConfirm={handleSignOut}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      }
    />
  );
}
