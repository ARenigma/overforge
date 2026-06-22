'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/ds/field';
import { createClient } from '@/lib/supabase/client';
import { Wordmark } from '@/components/marketing/wordmark';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Establish a session from the recovery link (PKCE ?code= or detected hash) before
  // allowing a password change.
  useEffect(() => {
    let active = true;
    async function establish() {
      const code = searchParams.get('code');
      try {
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
        }
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (!data.session) {
          setError(
            'This reset link is invalid or has expired. Request a new one from the sign-in page.'
          );
        } else {
          setReady(true);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not verify the reset link.');
        }
      } finally {
        if (active) setVerifying(false);
      }
    }
    void establish();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      setInfo('Password updated — redirecting to your dashboard…');
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        <div className="border border-border bg-card p-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password for your account.
            </p>
          </div>

          {error && (
            <Alert className="mb-4 border-destructive/40 bg-destructive/10">
              <AlertDescription className="text-sm text-destructive">{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert className="mb-4 border-primary/40 bg-primary/10">
              <AlertDescription className="text-sm text-primary">{info}</AlertDescription>
            </Alert>
          )}

          {verifying ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying reset link…
            </div>
          ) : ready ? (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field id="new-password" label="New password">
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    className="h-10 border-border bg-background pr-10 text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Button
                type="submit"
                loading={loading}
                className="h-11 w-full bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
              >
                Update password
              </Button>
            </form>
          ) : (
            <Link href="/auth" className="text-sm text-primary underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
