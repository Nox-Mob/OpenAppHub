// Service-role Supabase client: bypasses all row security, so it is used ONLY
// for what SHARED-SPEC §7.2 allows the hub: sending invitation emails, deleting
// accounts (and, later, the Stripe webhook). Never import this from UI code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@shared/supabase/client";

export function getServiceClient(): SupabaseClient | null {
  const config = supabaseConfig();
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!config || !key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
