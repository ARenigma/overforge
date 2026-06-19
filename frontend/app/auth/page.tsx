"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { Github, Gitlab, Linkedin, Mail, Eye, EyeOff, Loader2 } from "lucide-react";

type AuthMode = "signin" | "signup" | "magic";

const OAUTH_PROVIDERS = [
  {
    id: "google" as const,
    label: "Google",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
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
  { id: "github" as const, label: "GitHub", icon: <Github className="w-4 h-4" /> },
  { id: "gitlab" as const, label: "GitLab", icon: <Gitlab className="w-4 h-4" /> },
  {
    id: "linkedin_oidc" as const,
    label: "LinkedIn",
    icon: <Linkedin className="w-4 h-4" />,
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]["id"];

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo("Magic link sent — check your inbox.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo("Account created — check your email to confirm, then sign in.");
        return;
      }

      // signin
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
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
      setError(err instanceof Error ? err.message : "OAuth error.");
      setOauthLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0B0D] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-medium text-[#EAECEF]">Over</span>
          <span className="text-2xl font-bold text-[#2F6BFF]">Forge</span>
        </div>

        {/* Card */}
        <div className="bg-[#141619] border border-[#2A2E37] rounded-xl p-6 shadow-xl">
          {/* Mode tabs */}
          <div className="flex rounded-lg bg-[#0A0B0D] p-1 mb-6 gap-1">
            {(["signin", "signup", "magic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  clearMessages();
                  setMode(m);
                }}
                className={[
                  "flex-1 text-xs py-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]",
                  mode === m
                    ? "bg-[#1C1F25] text-[#EAECEF] shadow-sm"
                    : "text-[#9AA1AC] hover:text-[#EAECEF]",
                ].join(" ")}
              >
                {m === "signin" ? "Sign In" : m === "signup" ? "Sign Up" : "Magic Link"}
              </button>
            ))}
          </div>

          {/* Feedback banners */}
          {error && (
            <Alert className="mb-4 border-[#F2555A]/40 bg-[#F2555A]/10">
              <AlertDescription className="text-[#F2555A] text-sm">{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert className="mb-4 border-[#34D399]/40 bg-[#34D399]/10">
              <AlertDescription className="text-[#34D399] text-sm">{info}</AlertDescription>
            </Alert>
          )}

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#9AA1AC] text-xs uppercase tracking-wide">
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
                className="bg-[#0A0B0D] border-[#2A2E37] text-[#EAECEF] placeholder:text-[#9AA1AC]/50 focus-visible:ring-[#2F6BFF] focus-visible:border-[#2F6BFF] h-10"
              />
            </div>

            {mode !== "magic" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[#9AA1AC] text-xs uppercase tracking-wide">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-[#0A0B0D] border-[#2A2E37] text-[#EAECEF] placeholder:text-[#9AA1AC]/50 focus-visible:ring-[#2F6BFF] focus-visible:border-[#2F6BFF] h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA1AC] hover:text-[#EAECEF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF] rounded"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white font-medium focus-visible:ring-2 focus-visible:ring-[#2F6BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141619] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "signin" ? (
                "Sign In"
              ) : mode === "signup" ? (
                "Create Account"
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Magic Link
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-5 gap-3">
            <div className="flex-1 h-px bg-[#2A2E37]" />
            <span className="text-[#9AA1AC] text-xs">or continue with</span>
            <div className="flex-1 h-px bg-[#2A2E37]" />
          </div>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-2">
            {OAUTH_PROVIDERS.map(({ id, label, icon }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                onClick={() => handleOAuth(id)}
                disabled={oauthLoading !== null}
                className="h-9 border-[#2A2E37] bg-[#1C1F25] text-[#9AA1AC] hover:text-[#EAECEF] hover:bg-[#2A2E37] hover:border-[#2A2E37] focus-visible:ring-2 focus-visible:ring-[#2F6BFF] text-xs font-medium disabled:opacity-50 gap-2"
              >
                {oauthLoading === id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  icon
                )}
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Footer link */}
        <p className="mt-4 text-center text-xs text-[#9AA1AC]">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                onClick={() => { clearMessages(); setMode("signin"); }}
                className="text-[#2F6BFF] hover:underline focus:outline-none focus-visible:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              No account yet?{" "}
              <button
                onClick={() => { clearMessages(); setMode("signup"); }}
                className="text-[#2F6BFF] hover:underline focus:outline-none focus-visible:underline"
              >
                Sign up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
