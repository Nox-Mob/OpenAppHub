import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { InvitationPage } from "@shared/ui/InvitationPage";
import { Logo } from "@/components/site";

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
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <a href="/" className="mb-8" aria-label="OpenAppHub home">
        <Logo />
      </a>
      <InvitationPage
        token={token}
        app="hub"
        client={getSupabaseBrowserClient()}
        signInHref={(next) => `/login?next=${encodeURIComponent(next)}`}
        continueHref={() => "/"}
      />
    </main>
  );
}
