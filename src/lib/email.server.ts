// The hosted suite's email sender (S-16). The hub's Worker drains the shared outbox every
// few minutes through Resend, for every app, and serves /email/unsubscribe.
// Server-only: uses the service role key.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emailConfigFromEnv, runEmailCycle, type CycleResult } from "@shared/email/deliver";
import { handleUnsubscribe } from "@shared/email/unsubscribe";
import { parseSuiteUrls } from "@shared/supabase/hosted";

export type HubEnv = Record<string, string | undefined>;

function adminClient(env: HubEnv): SupabaseClient | null {
  const url = env["VITE_SUPABASE_URL"];
  const key = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function hubOrigin(env: HubEnv): string {
  return (env["VITE_HUB_URL"] || "https://openapphub.org").replace(/\/+$/, "");
}

/** One run of the sender. Returns null (and sends nothing) until the secrets are set. */
export async function runHubEmail(env: HubEnv): Promise<CycleResult | null> {
  const admin = adminClient(env);
  if (!admin) return null;
  // Hosted email goes through Resend only; without the key, email waits in the outbox.
  if (!env["RESEND_API_KEY"]) return null;
  const config = await emailConfigFromEnv(env, admin);
  if (!config) return null;
  const hub = hubOrigin(env);
  return runEmailCycle({
    admin,
    config,
    urls: { hub, ...parseSuiteUrls(env["VITE_SUITE_URLS"]) },
    preferencesUrl: `${hub}/account#email`,
    unsubscribeBase: hub,
    secret: env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  });
}

export async function hubUnsubscribe(request: Request, env: HubEnv): Promise<Response> {
  return handleUnsubscribe(request, {
    admin: adminClient(env),
    secret: env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
    preferencesUrl: `${hubOrigin(env)}/account#email`,
  });
}
