'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { Wordmark } from '@/components/marketing/wordmark';
import { cn } from '@/lib/utils';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { Github, Gitlab, Linkedin, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'magic';

const OAUTH_PROVIDERS = [
  {
    id: 'google' as const,
    label: 'Google',
    icon: (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  { id: 'github' as const, label: 'GitHub', icon: <Github className="w-4 h-4 shrink-0" /> },
  { id: 'gitlab' as const, label: 'GitLab', icon: <Gitlab className="w-4 h-4 shrink-0" /> },
  {
    id: 'linkedin_oidc' as const,
    label: 'LinkedIn',
    icon: <Linkedin className="w-4 h-4 shrink-0" />,
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]['id'];

const MODE_LABELS: Record<AuthMode, string> = {
  signin: 'Sign In',
  signup: 'Sign Up',
  magic: 'Magic Link',
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
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo('Magic link sent — check your inbox.');
        return;
      }

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

  const isAnyLoading = loading || oauthLoading !== null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm"
      >
        {/* Wordmark */}
        <motion.div variants={fadeUp} className="mb-8 flex justify-center">
          <Wordmark />
        </motion.div>

        {/* Auth card */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card p-6">
          {/* Mode tabs */}
          <div
            role="tablist"
            aria-label="Authentication method"
            className="flex rounded-lg bg-muted p-1 mb-6 gap-1"
          >
            {(['signin', 'signup', 'magic'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  clearMessages();
                  setMode(m);
                }}
                className={cn(
                  'flex-1 text-xs py-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted',
                  mode === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
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

            {/* Password field (hidden in magic-link mode) */}
            {mode !== 'magic' && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
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
            )}

            {/* Primary CTA — pill-shaped */}
            <Button
              type="submit"
              disabled={isAnyLoading}
              className={cn(
                'w-full h-11 rounded-full bg-primary text-primary-foreground font-medium',
                'hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                'disabled:opacity-60 disabled:cursor-not-allowed transition-opacity',
                loading && 'animate-pulse'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading" />
              ) : mode === 'signin' ? (
                'Sign In'
              ) : mode === 'signup' ? (
                'Create Account'
              ) : (
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  Send Magic Link
                </span>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-5 gap-3" role="separator" aria-hidden="true">
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              or continue with
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* OAuth provider buttons */}
          <div className="grid grid-cols-2 gap-2">
            {OAUTH_PROVIDERS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleOAuth(id)}
                disabled={isAnyLoading}
                aria-label={`Continue with ${label}`}
                className={cn(
                  'h-9 flex items-center justify-center gap-2 rounded-lg border border-border bg-card',
                  'text-xs font-medium text-muted-foreground',
                  'hover:bg-muted hover:text-foreground hover:border-border',
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
        </motion.div>

        {/* Footer toggle */}
        <motion.p variants={fadeUp} className="mt-5 text-center text-xs text-muted-foreground">
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
        </motion.p>
      </motion.div>
    </div>
  );
}
