import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { themeInitScript } from "@shared/theme";
import { getSessionUser } from "@/lib/session";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  beforeLoad: async () => ({ user: await getSessionUser() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OpenAppHub" },
      {
        name: "description",
        content: "One account for OpenCharterApp, OpenBoardApp and OpenLedgerApp.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => {
    console.error(error);
    return (
      <Centered title="This page didn't load">
        Something went wrong on our end. Try refreshing, or{" "}
        <a className="underline" href="/">
          go home
        </a>
        .
      </Centered>
    );
  },
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-app="hub" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark/system choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return <Outlet />;
}

function NotFound() {
  return (
    <Centered title="Page not found">
      The page you're looking for doesn't exist.{" "}
      <Link className="underline" to="/">
        Go home
      </Link>
      .
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </main>
  );
}
