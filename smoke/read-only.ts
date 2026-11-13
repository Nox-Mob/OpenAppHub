// The smoke test must never change anything on production. Every request the pages make is
// checked: database writes (inserts, updates, deletes, and functions that change things) are
// stopped and fail the test. Signing in is the one write allowed (it makes a session).
import type { Page } from "@playwright/test";

/**
 * Database functions that change things, by the suite's naming (set_, save_, delete_…). Table
 * inserts, updates and deletes are stopped whatever their name.
 */
const WRITE_FUNCTIONS =
  /^(hub_)?(set|save|delete|remove|create|add|update|mark|complete|skip|accept|decline|invite|transfer|apply|record|post|cancel|revoke|reset|send|enqueue|approve|reject|lock|unlock|close|reopen|import|join|leave|register|run|start|finish|move|rename|archive|restore|grant|claim|pay|refund|issue|void|merge|sync|emit|notify|prune|test)(_|$)/;

export type Blocked = { method: string; url: string };

export async function readOnly(page: Page): Promise<Blocked[]> {
  const blocked: Blocked[] = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const write = (() => {
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
      // Supabase Auth: signing in (password grant) and refreshing the session.
      if (url.pathname.endsWith("/auth/v1/token")) return false;
      if (url.pathname.includes("/rest/v1/rpc/")) {
        const fn = url.pathname.split("/rest/v1/rpc/")[1] ?? "";
        return WRITE_FUNCTIONS.test(fn);
      }
      if (url.pathname.includes("/rest/v1/")) return true;
      if (url.pathname.includes("/storage/v1/") && method !== "POST") return true;
      // The apps' own server functions (TanStack Start) are POSTs; they only read on the pages
      // the smoke test opens. Analytics and the like are left alone.
      return false;
    })();
    if (write) {
      blocked.push({ method, url: `${url.origin}${url.pathname}` });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return blocked;
}
