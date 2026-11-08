// Per-request Supabase client for SSR and server functions, acting as the
// signed-in user through their session cookie. Never uses the service role.
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { cookieOptions, supabaseConfig } from "@shared/supabase/client";

export function getSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    cookieOptions: { ...cookieOptions(), secure: !import.meta.env.DEV },
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) setCookie(name, value, options);
      },
    },
  });
}
