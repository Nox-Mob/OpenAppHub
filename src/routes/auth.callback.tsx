import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { goTo, validateNextSearch } from "@/lib/auth-client";
import { safeNext } from "@/lib/next";

// Landing page for Google sign-in, email confirmation and password-reset links.
// The browser client exchanges the PKCE `code` in the URL for a session as it
// starts; this page waits for that, then continues to `next`.
export const Route = createFileRoute("/auth/callback")({
  validateSearch: validateNextSearch,
  head: () => ({ meta: [{ title: "Signing in · OpenAppHub" }] }),
  component: CallbackPage,
});

function linkError(): string | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    query.get("error_description") ??
    hash.get("error_description") ??
    query.get("error") ??
    hash.get("error")
  );
}

function CallbackPage() {
  const { next } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromLink = linkError();
    if (fromLink) return setError(fromLink);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Sign-in isn't configured on this site.");
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        setError(error?.message ?? "This link is invalid or has expired.");
        return;
      }
      goTo(safeNext(next, window.location.origin));
    });
  }, [next]);

  if (!error) {
    return (
      <AuthCard title="Signing you in…">
        <p className="text-sm text-muted-foreground">One moment.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="We couldn't sign you in">
      <p className="text-sm text-muted-foreground">{error}</p>
      <p className="mt-4 text-sm">
        <Link to="/login" className="font-medium underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
