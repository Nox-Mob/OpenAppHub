import { createServerFn } from "@tanstack/react-start";
import type { OrgBilling } from "@shared/supabase/billing";
import type { MyOrg, OrgPreferences, OrgRole } from "@shared/supabase/org";

export type HubContext = {
  orgs: MyOrg[];
  currentOrgId: string | null;
  role: OrgRole | null;
  billing: OrgBilling | null;
  demoTools: boolean;
  /** The current org's time zone and currency, for shared/format.ts. */
  prefs: OrgPreferences;
};

const EMPTY: HubContext = {
  orgs: [],
  currentOrgId: null,
  role: null,
  billing: null,
  demoTools: false,
  prefs: { timeZone: "UTC", currency: "USD" },
};

/**
 * Everything the signed-in screens need, in one round trip: the user's
 * organizations, the current one (oah_org cookie, re-checked against
 * memberships), their role in it, its billing state (null when billing is off)
 * and whether staging demo tools are available. Resilient: if the database
 * isn't set up, it returns "no organizations" instead of failing the page.
 */
export const getHubContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<HubContext> => {
    const [{ getSupabaseServerClient }, { getCookie }, org, billing] = await Promise.all([
      import("./supabase.server"),
      import("@tanstack/react-start/server"),
      import("@shared/supabase/org"),
      import("@shared/supabase/billing"),
    ]);
    const supabase = getSupabaseServerClient();
    if (!supabase) return EMPTY;
    try {
      const orgs = await org.listMyOrgs(supabase);
      const cookie = getCookie(org.ORG_COOKIE) ?? null;
      const current = org.resolveCurrentOrg(
        orgs,
        cookie ? org.readOrgCookie(`oah_org=${cookie}`) : null,
      );
      const [orgBilling, demo, prefs] = await Promise.all([
        current
          ? billing.getOrgBilling(supabase, current.id).catch(() => null)
          : Promise.resolve(null),
        supabase.rpc("hub_demo_tools_enabled").then(
          ({ data }) => data === true,
          () => false,
        ),
        current ? org.getOrgPreferences(supabase, current.id) : Promise.resolve(EMPTY.prefs),
      ]);
      return {
        orgs,
        currentOrgId: current?.id ?? null,
        role: current?.role ?? null,
        billing: orgBilling,
        demoTools: demo,
        prefs,
      };
    } catch (error) {
      console.error("getHubContext:", error instanceof Error ? error.message : error);
      return EMPTY;
    }
  },
);
