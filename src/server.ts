// Worker entry: TanStack Start's handler plus security headers (SHARED-SPEC §10.1).
import handler from "@tanstack/react-start/server-entry";
import { withSecurityHeaders } from "./lib/security-headers";

type Env = { VITE_SUPABASE_URL?: string };

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await (handler.fetch as (r: Request, e: unknown, c: unknown) => Promise<Response>)(
        request,
        env,
        ctx,
      );
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
};
