import { createServerFn } from "@tanstack/react-start";

export type SessionUser = { id: string; email: string | null; name: string | null };

/**
 * Who is signed in, verified with Supabase Auth (not just decoded from the
 * cookie). Runs on the server during SSR and as an RPC on client navigation.
 */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const { getSupabaseServerClient } = await import("./supabase.server");
    const supabase = getSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const meta = data.user.user_metadata ?? {};
    const name =
      (typeof meta["full_name"] === "string" && meta["full_name"]) ||
      (typeof meta["name"] === "string" && meta["name"]) ||
      null;
    return { id: data.user.id, email: data.user.email ?? null, name };
  },
);
