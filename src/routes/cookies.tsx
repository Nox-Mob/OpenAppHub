import { createFileRoute } from "@tanstack/react-router";
import { openCookieSettings } from "@shared/consent";
import { formatDate } from "@shared/format";
import { CookieTable } from "@shared/ui/CookieConsent";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site";

// Cookie policy: every cookie the suite sets, from shared/consent.ts, so the
// list on this page is the same list the banner and the code use.
const UPDATED = "2026-11-09";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie policy · OpenAppHub" },
      {
        name: "description",
        content: "The cookies OpenAppHub uses, what they're for and how to change your choices.",
      },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  const { user } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader signedIn={!!user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Cookie policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {formatDate(UPDATED)}</p>
        <div className="mt-6 space-y-3 text-base text-muted-foreground">
          <p>
            Cookies are small files a website stores in your browser. OpenAppHub and its apps
            (OpenCharterApp, OpenBoardApp and OpenLedgerApp) use a few, all set by us on
            openapphub.org and its subdomains. We don't use advertising or tracking cookies, and we
            don't share cookie data with anyone.
          </p>
          <p>
            <strong className="text-foreground">Required cookies</strong> are always on, because the
            apps can't work without them.{" "}
            <strong className="text-foreground">Preference cookies</strong> are only used if you say
            yes, and you can change your mind at any time. Your choice applies to every OpenAppHub
            app.
          </p>
        </div>
        <Button className="mt-6" variant="outline" onClick={() => openCookieSettings()}>
          Change your cookie settings
        </Button>
        <div className="mt-10">
          <CookieTable />
        </div>
        <div className="mt-10 space-y-3 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Other services</h2>
          <p>
            If you sign in with Google, or when payments are added and you pay through Stripe, you
            visit their pages and they may set their own cookies there, under their own policies. We
            don't control those cookies.
          </p>
          <p>
            You can also delete cookies in your browser's settings. If you delete the required ones,
            you'll be signed out.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
