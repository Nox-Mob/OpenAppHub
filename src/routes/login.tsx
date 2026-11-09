import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient, supabaseConfig } from "@shared/supabase/client";
import { AuthCard, GoogleIcon, NotConfigured } from "@/components/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, callbackUrl, goTo, validateNextSearch } from "@/lib/auth-client";
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    goTo(safeNext(next, window.location.origin));
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
        </div>
      )}
    </AuthCard>
  );
}
