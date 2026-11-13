import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { ActionLinkPage } from "@shared/ui/ActionLink";
import { Logo } from "@/components/site";

// A signed link from an email (core 0014, C-08): what it will do, then Confirm, signed in as the
// person it was sent to. Nothing happens on opening the link.
export const Route = createFileRoute("/act/$token")({
  head: () => ({
    meta: [{ title: "Confirm · OpenAppHub" }, { name: "robots", content: "noindex" }],
  }),
  component: ActPage,
});

function ActPage() {
  const { token } = Route.useParams();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <a href="/" className="mb-8" aria-label="OpenAppHub home">
        <Logo />
      </a>
      <ActionLinkPage
        client={getSupabaseBrowserClient()}
        token={token}
        app="hub"
        signInHref={(next) => `/login?next=${encodeURIComponent(next)}`}
      />
    </main>
  );
}
