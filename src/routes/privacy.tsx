import { Link, createFileRoute } from "@tanstack/react-router";

// Placeholder: the owner provides the final text before launch.
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy · OpenAppHub" }] }),
  component: () => (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground underline">
        OpenAppHub
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">
        This page is a draft. The final Privacy Policy will be published here before OpenAppHub
        opens to new accounts.
      </p>
    </main>
  ),
});
