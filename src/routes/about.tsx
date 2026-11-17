import { createFileRoute } from "@tanstack/react-router";
import { AboutLicenses } from "@shared/ui/About";
import { SiteFooter, SiteHeader } from "@/components/site";

// About and open-source licenses (SHARED-SPEC §10.3): the services the suite uses and every
// package the hub ships, from public/third-party.json (shared/licenses/generate.mjs).
export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About and open-source licenses · OpenAppHub" },
      {
        name: "description",
        content:
          "The services OpenAppHub uses and the open-source software it's built on, with each license.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { user } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader signedIn={!!user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">About and open-source licenses</h1>
        <div className="mt-6">
          <AboutLicenses appName="OpenAppHub" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
