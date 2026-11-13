// H-04: people across the apps. Each person's role in OpenAppHub and in every app the
// organization uses, from each app's read-only api_people view (null: that app isn't here).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRole } from "@shared/supabase/org";
import { isMissing } from "@shared/integrations/detect";
import type { AppRole } from "./roles";

export type RoleSource = "owner" | "person" | "named" | "fallback";
export type ResolvedRole = { role: AppRole; source: RoleSource };
export type NamedRole = {
  id: string;
  name: string;
  description: string;
  app_roles: Partial<Record<SuiteApp, Exclude<AppRole, "owner">>>;
  permissions: Partial<Record<SuiteApp, string[]>>;
};
export type PermissionType = {
  app: SuiteApp;
  key: string;
  label: string;
  description: string;
  sort: number;
};

export type AppRoles = {
  charter: Map<string, string> | null;
  board: Map<string, string> | null;
  ledger: Map<string, string> | null;
  /** Roles set for one person in one app (core 0010; "none": No access, core 0015), keyed
   * `${app}:${userId}`. */
  overrides: Map<string, AppRole>;
  /** Each person's role in each app as the database works it out (core 0011), keyed
   * `${app}:${userId}`; empty on a database before core 0011. */
  resolved: Map<string, ResolvedRole>;
  /** Each person's named role id (core 0011). */
  namedRoleOf: Map<string, string>;
  namedRoles: NamedRole[];
  permissionTypes: PermissionType[];
  /** People (besides owners and admins) who may build workflows (core 0009). */
  workflowEditors: Set<string>;
};

export type SuiteApp = "charter" | "board" | "ledger";

/**
 * Someone's role in one app (H-09): the owner is the owner; otherwise what the database worked
 * out (set for them, their named role, or viewer). On a database before core 0011, the role set
 * for the app, or their OpenAppHub role.
 */
export function appRoleOf(
  core: OrgRole,
  app: SuiteApp,
  userId: string,
  overrides: Map<string, AppRole>,
  resolved?: Map<string, ResolvedRole>,
): AppRole {
  if (core === "owner") return "owner";
  const r = resolved?.get(`${app}:${userId}`);
  if (r) return r.role;
  if (resolved && resolved.size > 0) return overrides.get(`${app}:${userId}`) ?? "viewer";
  return overrides.get(`${app}:${userId}`) ?? core;
}

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
  const [charter, board, ledger, ov, ed, res, nr, pt, mem] = await Promise.all([
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
    client.schema("public").from("app_role_overrides").select("*").eq("org_id", orgId),
    client.schema("public").from("automation_editors").select("user_id").eq("org_id", orgId),
    client.schema("public").rpc("org_app_roles", { p_org: orgId }),
    client
      .schema("public")
      .from("org_named_roles")
      .select("id, name, description, app_roles, permissions")
      .eq("org_id", orgId)
      .order("name"),
    client
      .schema("public")
      .from("app_permission_types")
      .select("app, key, label, description, sort")
      .order("sort"),
    client
      .schema("public")
      .from("memberships")
      .select("user_id, named_role_id")
      .eq("org_id", orgId),
  ]);
  const resolved = new Map<string, ResolvedRole>();
  for (const r of ((res.error ? [] : res.data) ?? []) as Array<{
    user_id: string;
    app: string;
    role: OrgRole | null;
    source: RoleSource;
  }>)
    // A null role is No access in that app (core 0015).
    resolved.set(`${r.app}:${r.user_id}`, { role: r.role ?? "none", source: r.source });
  const namedRoleOf = new Map<string, string>();
  for (const m of ((mem.error ? [] : mem.data) ?? []) as Array<{
    user_id: string;
    named_role_id: string | null;
  }>)
    if (m.named_role_id) namedRoleOf.set(m.user_id, m.named_role_id);
  const overrides = new Map<string, AppRole>();
  for (const r of ((ov.error ? [] : ov.data) ?? []) as Array<{
    user_id: string;
    app: string;
    role: OrgRole;
    no_access?: boolean;
  }>)
    overrides.set(`${r.app}:${r.user_id}`, r.no_access ? "none" : r.role);
  const workflowEditors = new Set(
    (((ed.error ? [] : ed.data) ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );
  return {
    charter,
    board,
    ledger,
    overrides,
    resolved,
    namedRoleOf,
    namedRoles: ((nr.error ? [] : nr.data) ?? []) as NamedRole[],
    permissionTypes: ((pt.error ? [] : pt.data) ?? []) as PermissionType[],
    workflowEditors,
  };
}
