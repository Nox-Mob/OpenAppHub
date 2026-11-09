import { createServerFn } from "@tanstack/react-start";
import type { MyOrg } from "@shared/supabase/org";

export type OrgContext = { orgs: MyOrg[]; currentOrgId: string | null };

/**
 * The signed-in user's organizations and the current one (oah_org cookie,
 * re-checked against memberships). Resilient: before the core migrations exist,
 * it returns no organizations rather than failing the page.
 */
export const getOrgContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrgContext> => {
    const [{ getSupabaseServerClient }, { getCookie }, org] = await Promise.all([
      import("./supabase.server"),
      import("@tanstack/react-start/server"),
      import("@shared/supabase/org"),
    ]);
    const supabase = getSupabaseServerClient();
    if (!supabase) return { orgs: [], currentOrgId: null };
    try {
      const orgs = await org.listMyOrgs(supabase);
      const cookie = getCookie(org.ORG_COOKIE) ?? null;
      const current = org.resolveCurrentOrg(
        orgs,
        cookie ? org.readOrgCookie(`oah_org=${cookie}`) : null,
      );
      return { orgs, currentOrgId: current?.id ?? null };
    } catch (error) {
      console.error("getOrgContext:", error instanceof Error ? error.message : error);
      return { orgs: [], currentOrgId: null };
    }
  },
);
