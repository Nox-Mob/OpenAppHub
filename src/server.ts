// Worker entry: TanStack Start's handler plus security headers (SHARED-SPEC §10.1).
import handler from "@tanstack/react-start/server-entry";
import { hubUnsubscribe, runHubEmail, type HubEnv } from "./lib/email.server";
import { withSecurityHeaders } from "./lib/security-headers";

type Env = HubEnv & { VITE_SUPABASE_URL?: string };
type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    let response: Response;
    try {
      // Email unsubscribe links (S-16): plain HTML, outside the app's router.
      if (new URL(request.url).pathname === "/email/unsubscribe") {
        response = await hubUnsubscribe(request, env);
      } else {
        const fetchApp = handler.fetch as (r: Request, e: unknown, c: unknown) => Promise<Response>;
        response = await fetchApp(request, env, ctx);
      }
    } catch (error) {
      console.error(error);
      response = new Response("Something went wrong. Please try again.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return withSecurityHeaders(response, {
      supabaseUrl: env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
      // Vite's dev server injects inline module scripts and websockets.
      csp: !import.meta.env.DEV,
    });
  },

  // Cron (wrangler.jsonc "triggers"): the suite's email sender (S-16).
  async scheduled(_controller: unknown, env: Env, ctx: ScheduledContext): Promise<void> {
    ctx.waitUntil(
      runHubEmail(env).then(
        (result) => {
          if (result && (result.sent || result.failed || result.retried))
            console.log("email", JSON.stringify(result));
        },
        (error) => console.error("email", error),
      ),
    );
  },
};
