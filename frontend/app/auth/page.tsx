'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { Wordmark } from '@/components/marketing/wordmark';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

const OAUTH_PROVIDERS = [
  {
    id: 'google' as const,
    label: 'Google',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: 'github' as const,
    label: 'GitHub',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path
          fill="currentColor"
          d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.2 22 16.447 22 12.021 22 6.484 17.523 2 12 2z"
        />
      </svg>
    ),
  },
  {
    id: 'gitlab' as const,
    label: 'GitLab',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path fill="#E24329" d="M12 21.636 7.29 7.137h9.42z" />
        <path fill="#FC6D26" d="M12 21.636 2.31 7.137h4.98z" />
        <path fill="#FCA326" d="M7.29 7.137 5.42 1.5a.432.432 0 0 0-.822 0L2.31 7.137z" />
        <path fill="#FC6D26" d="M12 21.636 21.69 7.137h-4.98z" />
        <path fill="#FCA326" d="M16.71 7.137 18.58 1.5a.432.432 0 0 1 .822 0l2.288 5.637z" />
      </svg>
    ),
  },
  {
    id: 'linkedin_oidc' as const,
    label: 'LinkedIn',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <rect width="24" height="24" rx="3" fill="#0A66C2" />
        <path
          fill="#ffffff"
          d="M7.75 9.5h-2.5v8.5h2.5V9.5zm-1.25-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10.25 4c-1.38 0-2.25.75-2.5 1.25V9.5h-2.5v8.5h2.5v-4.5c0-1.1.9-2 2-2s2 .9 2 2V18h2.5v-5c0-2.21-1.57-3.5-3.5-3.5z"
        />
      </svg>
    ),
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]['id'];

const HEADINGS: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: {
    title: 'Welcome back',
    subtitle: 'Sign in to your account',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Start screening candidates in minutes',
  },
};

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setInfo(null);
  };

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo('Account created — check your email to confirm, then sign in.');
        return;
      }

      // signin
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    clearMessages();
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      // Browser will navigate; keep spinner until redirect fires.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth error.');
      setOauthLoading(null);
    }
  }

  async function handleForgotPassword() {
    clearMessages();
    if (!email) {
      setError('Enter your email above first, then tap “Forgot password?”.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setInfo('Password reset link sent — check your inbox.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset link.');
    } finally {
      setLoading(false);
    }
  }

  const isAnyLoading = loading || oauthLoading !== null;
  const { title, subtitle } = HEADINGS[mode];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <Reveal className="w-full max-w-md">
        {/* Wordmark */}
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        {/* Auth card */}
        <div className="border border-border bg-card p-6">
          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Feedback banners */}
          {error && (
            <Alert className="mb-4 border-destructive/40 bg-destructive/10">
              <AlertDescription className="text-destructive text-sm">{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert className="mb-4 border-primary/40 bg-primary/10">
              <AlertDescription className="text-primary text-sm">{info}</AlertDescription>
            </Alert>
          )}

          {/* OAuth provider buttons — above the email form, Supabase-style */}
          <div className="grid grid-cols-2 gap-2">
            {OAUTH_PROVIDERS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleOAuth(id)}
                disabled={isAnyLoading}
                aria-label={`Continue with ${label}`}
                className={cn(
                  'h-9 flex items-center justify-center gap-2 border border-border bg-card',
                  'text-xs font-medium text-muted-foreground',
                  'hover:bg-accent hover:text-foreground',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  oauthLoading === id && 'animate-pulse'
                )}
              >
                {oauthLoading === id ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-label={`Connecting to ${label}`} />
                ) : (
                  icon
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center my-5 gap-3" role="separator" aria-hidden="true">
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              or continue with email
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4" noValidate>
            {/* Email field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isAnyLoading}
                aria-describedby={error ? 'auth-error' : undefined}
                className={cn(
                  'h-10 bg-background border-border text-foreground placeholder:text-muted-foreground/50',
                  'focus-visible:ring-ring focus-visible:border-ring',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  loading && 'animate-pulse'
                )}
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isAnyLoading}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:underline disabled:pointer-events-none"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isAnyLoading}
                  className={cn(
                    'h-10 bg-background border-border text-foreground placeholder:text-muted-foreground/50 pr-10',
                    'focus-visible:ring-ring focus-visible:border-ring',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    loading && 'animate-pulse'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isAnyLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded disabled:pointer-events-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Primary CTA */}
            <Button
              type="submit"
              disabled={isAnyLoading}
              className={cn(
                'w-full h-11 bg-primary text-primary-foreground font-medium',
                'transition-opacity hover:opacity-90 active:scale-[0.98]',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                loading && 'animate-pulse'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading" />
              ) : mode === 'signin' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </div>

        {/* Footer toggle */}
        <p className="mt-5 text-center text-xs text-muted-foreground">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  clearMessages();
                  setMode('signin');
                }}
                className="text-foreground hover:underline focus:outline-none focus-visible:underline underline-offset-2"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              No account yet?{' '}
              <button
                onClick={() => {
                  clearMessages();
                  setMode('signup');
                }}
                className="text-foreground hover:underline focus:outline-none focus-visible:underline underline-offset-2"
              >
                Sign up
              </button>
            </>
          )}
        </p>
      </Reveal>
    </div>
  );
}
