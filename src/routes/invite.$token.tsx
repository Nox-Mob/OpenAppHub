import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { InvitationPage } from "@shared/ui/InvitationPage";
import { Logo } from "@/components/site";
import { sessionFromHash } from "@/lib/auth-hash";

// The hub's invitation page (SHARED-SPEC §4.3): core invitations are accepted
// here; an invitation for an app is sent on to that app's /invite page.
export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [{ title: "Invitation · OpenAppHub" }, { name: "robots", content: "noindex" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  // People new to OpenAppHub arrive from Supabase's invite email already signed
  // in (tokens in the URL fragment) but without a password: start the session,
  // and after joining send them to choose one.
  const [ready, setReady] = useState(false);
  const [newAccount, setNewAccount] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const fromHash = sessionFromHash(window.location.hash);
    if (!supabase || !fromHash) return setReady(true);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    void supabase.auth
      .setSession({ access_token: fromHash.access_token, refresh_token: fromHash.refresh_token })
      .finally(() => {
        setNewAccount(fromHash.type === "invite");
        setReady(true);
      });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <a href="/" className="mb-8" aria-label="OpenAppHub home">
        <Logo />
      </a>
      {ready ? (
        <InvitationPage
          token={token}
          app="hub"
          client={getSupabaseBrowserClient()}
          signInHref={(next) => `/login?next=${encodeURIComponent(next)}`}
          continueHref={() => (newAccount ? "/reset-password" : "/")}
        />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Signing you in…
        </p>
      )}
    </main>
  );
}
