// H-04: people across the apps. Each person's role in OpenAppHub and in every app the
// organization uses, from each app's read-only api_people view (null: that app isn't here).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRole } from "@shared/supabase/org";
import { isMissing } from "@shared/integrations/detect";

export type AppRoles = {
  charter: Map<string, string> | null;
  board: Map<string, string> | null;
  ledger: Map<string, string> | null;
};

const OFFICE: Record<string, string> = {
  chair: "Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
};

/** OpenBoardApp: owner and admin as they are, a member with an office holds it, a viewer observes. */
export function boardRole(core: OrgRole, office: string | undefined): string {
  if (core === "owner") return "Owner";
  if (core === "admin") return "Administrator";
  if (core === "viewer") return "Observer";
  return office ? (OFFICE[office] ?? office) : "Board member";
}

/** OpenLedgerApp (its own mapping, core-org.ts): owners and admins are admins; a member is a
 * treasurer when Ledger says so, otherwise a member (who can record); a viewer views. */
export function ledgerRole(core: OrgRole, role: string | undefined): string {
  if (core === "owner" || core === "admin") return "Admin";
  if (core === "member") return role === "treasurer" ? "Treasurer" : "Member";
  return "View only";
}

async function byUser(
  q: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
  col: string,
): Promise<Map<string, string> | null> {
  const { data, error } = await q;
  if (error) return isMissing(error) ? null : new Map();
  return new Map(
    ((data ?? []) as Array<Record<string, string>>).map((r) => [r["user_id"]!, r[col] ?? ""]),
  );
}

export async function loadAppRoles(client: SupabaseClient, orgId: string): Promise<AppRoles> {
  const [charter, board, ledger] = await Promise.all([
    byUser(
      client.schema("charter").from("api_people").select("user_id, roles").eq("org_id", orgId),
      "roles",
    ),
    byUser(
      client.schema("board").from("api_people").select("user_id, office").eq("org_id", orgId),
      "office",
    ),
    byUser(
      client.schema("ledger").from("api_people").select("user_id, role").eq("org_id", orgId),
      "role",
    ),
  ]);
  return { charter, board, ledger };
}
