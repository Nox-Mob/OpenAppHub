import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient, supabaseConfig } from "@shared/supabase/client";
import { AuthCard, GoogleIcon, NotConfigured } from "@/components/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, callbackUrl, goTo, validateNextSearch } from "@/lib/auth-client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PUBLIC, demoLoginEnabled } from "@/lib/demo-accounts";
import { currentOrigin, safeNext } from "@/lib/next";

export const Route = createFileRoute("/login")({
  validateSearch: validateNextSearch,
  beforeLoad: ({ context, search }) => {
    if (!context.user) return;
    // Already signed in: carry on to where they were going.
    const target = safeNext(search.next, currentOrigin());
    throw target.startsWith("/") ? redirect({ to: target }) : redirect({ href: target });
  },
  head: () => ({ meta: [{ title: "Sign in · OpenAppHub" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = supabaseConfig() !== null;
  const nextSearch = next ? { next } : {};

  async function signIn(account: { email: string; password: string }) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword(account);
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    goTo(safeNext(next, window.location.origin));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn({ email, password });
  }

  async function onGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(safeNext(next, window.location.origin)) },
    });
    if (error) setError(authErrorMessage(error));
  }

  return (
    <AuthCard
      title="Sign in"
      description="One account for every OpenAppHub app."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" search={nextSearch} className="font-medium text-foreground underline">
            Create an account
          </Link>
        </>
      }
    >
      {!configured ? (
        <NotConfigured />
      ) : (
        <div className="space-y-6">
          <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
            <GoogleIcon />
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {demoLoginEnabled() ? (
            <div className="space-y-2 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Staging demo</p>
              <p className="text-sm text-muted-foreground">
                Every demo account resets every 12 hours. Password:{" "}
                <code>{DEMO_PASSWORD_PUBLIC}</code>
              </p>
              {DEMO_ACCOUNTS.map((a) => (
                <Button
                  key={a.email}
                  type="button"
                  variant="outline"
                  className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
                  disabled={busy}
                  onClick={() => void signIn({ email: a.email, password: DEMO_PASSWORD_PUBLIC })}
                >
                  <span>{a.label}</span>
                  <span className="whitespace-normal text-xs font-normal text-muted-foreground">
                    {a.description}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </AuthCard>
  );
}
