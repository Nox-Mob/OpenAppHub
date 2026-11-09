import { Link, createFileRoute } from "@tanstack/react-router";

// Placeholder: the owner provides the final text before launch.
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service · OpenAppHub" }] }),
  component: () => (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground underline">
        OpenAppHub
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-muted-foreground">
        This page is a draft. The final Terms of Service will be published here before OpenAppHub
        opens to new accounts.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Changes</h2>
      <p className="mt-2 text-muted-foreground">
        When we change these Terms, we email everyone with an OpenAppHub account before the change
        takes effect. Continuing to use OpenAppHub after that means you accept the updated version.
      </p>
    </main>
  ),
});
