import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient, supabaseConfig } from "@shared/supabase/client";
import { AuthCard, GoogleIcon, NotConfigured } from "@/components/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, callbackUrl, goTo, validateNextSearch } from "@/lib/auth-client";
import { isCharterJoinNext, safeNext } from "@/lib/next";

export const Route = createFileRoute("/signup")({
  validateSearch: validateNextSearch,
  head: () => ({ meta: [{ title: "Create an account · OpenAppHub" }] }),
  component: SignupPage,
});

const MIN_PASSWORD = 8;

function signupsOpen() {
  return import.meta.env.VITE_SIGNUPS_OPEN !== "false";
}

function SignupPage() {
  const { next } = Route.useSearch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const configured = supabaseConfig() !== null;
  const nextSearch = next ? { next } : {};
  // A Charter join page sends people here first; they join their association
  // after sign-up and aren't asked to create an organization (§4.5).
  const joining = next ? isCharterJoinNext(next) : false;

  const footer = (
    <>
      Already have an account?{" "}
      <Link to="/login" search={nextSearch} className="font-medium text-foreground underline">
        Sign in
      </Link>
    </>
  );

  if (!signupsOpen()) {
    return (
      <AuthCard title="Sign-ups are closed for now" footer={footer}>
        <p className="text-sm text-muted-foreground">
          OpenAppHub isn't open to new accounts yet. If you already have an account, sign in.
        </p>
      </AuthCard>
    );
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your email" footer={footer}>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>. Open
          it to finish creating your account.
        </p>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (password.length < MIN_PASSWORD) {
      setError(`Choose a password with at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (!accepted) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    setBusy(true);
    setError("");
    const target = safeNext(next, window.location.origin);
    const acceptedAt = new Date().toISOString();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl(target),
        // full_name becomes the profile's display name (handle_new_user, §3.2).
        // Acceptance is recorded here until hub.legal_acceptances exists.
        data: {
          full_name: name.trim(),
          terms_accepted_at: acceptedAt,
          privacy_accepted_at: acceptedAt,
        },
      },
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if (data.session) goTo(target);
    else setSentTo(email);
  }

  async function onGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(safeNext(next, window.location.origin)) },
    });
    if (error) setError(authErrorMessage(error));
  }

  return (
    <AuthCard
      title="Create your account"
      description={
        joining
          ? "Create an account, then you'll go back to finish joining your association."
          : "One account for every OpenAppHub app."
      }
      footer={footer}
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
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                aria-describedby="password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p id="password-hint" className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD} characters.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="accept"
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <Label htmlFor="accept" className="font-normal leading-snug">
                I agree to the{" "}
                <Link to="/terms" className="underline" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline" target="_blank">
                  Privacy Policy
                </Link>
                .
              </Label>
            </div>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>
      )}
    </AuthCard>
  );
}
