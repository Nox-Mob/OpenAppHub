import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { docsUrl } from "@shared/docs";
import { suiteUrls, type SuiteApp } from "@shared/supabase/hosted";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const APPS: { id: SuiteApp; name: string; blurb: string }[] = [
  { id: "charter", name: "OpenCharterApp", blurb: "Members, chapters and dues for associations." },
  { id: "board", name: "OpenBoardApp", blurb: "Meetings, minutes and decisions for boards." },
  { id: "ledger", name: "OpenLedgerApp", blurb: "Budgets and books for small nonprofits." },
];

function HomePage() {
  const { user } = Route.useRouteContext();
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-semibold tracking-tight">
            OpenAppHub
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <a className="px-2 text-muted-foreground hover:text-foreground" href={docsUrl("hub/")}>
              Docs
            </a>
            {user ? (
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">
        {user ? <SignedIn name={user.name ?? user.email ?? "there"} /> : <SignedOut />}
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {APPS.map((app) => {
            const url = suiteUrls()[app.id];
            return (
              <li key={app.id} className="rounded-lg border bg-card p-5">
                <h2 className="font-semibold">{app.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{app.blurb}</p>
                {user && url ? (
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <a href={url}>Open</a>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function SignedIn({ name }: { name: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name}</h1>
      <p className="mt-2 text-muted-foreground">
        You're signed in. Organizations, members and billing are coming next.
      </p>
    </section>
  );
}

function SignedOut() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        One account for your organization's apps
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        OpenAppHub brings OpenCharterApp, OpenBoardApp and OpenLedgerApp together with one sign-in.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/signup">Create account</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </section>
  );
}
