// Turns hub.audit_log rows into plain sentences for the audit log screen.
import { ROLE_LABEL } from "./roles";
import type { OrgRole } from "@shared/supabase/org";

export type AuditEntry = {
  id: number;
  at: string;
  actor: string | null;
  actor_name: string;
  action: "insert" | "update" | "delete";
  table_name: string;
  row_key: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const role = (r: unknown) => ROLE_LABEL[r as OrgRole] ?? String(r ?? "");
const q = (s: unknown) => `“${String(s ?? "")}”`;

/** names: user id → display name, for the people in the org today. */
export function describeAudit(e: AuditEntry, names: Record<string, string>): string {
  const n = e.new_data ?? {};
  const o = e.old_data ?? {};
  const person = (id: unknown) => names[String(id)] ?? "a former member";
  switch (e.table_name) {
    case "organizations":
      if (e.action === "insert") return `Created the organization ${q(n["name"])}`;
      if (e.action === "delete") return `Deleted the organization ${q(o["name"])}`;
      if (n["name"] !== o["name"])
        return `Renamed the organization from ${q(o["name"])} to ${q(n["name"])}`;
      {
        const changes: string[] = [];
        if (n["time_zone"] !== o["time_zone"] && typeof n["time_zone"] === "string")
          changes.push(`time zone to ${n["time_zone"]}`);
        if (n["currency"] !== o["currency"] && typeof n["currency"] === "string")
          changes.push(`currency to ${n["currency"]}`);
        if (changes.length) return `Changed the ${changes.join(" and ")}`;
      }
      return "Changed the organization";
    case "memberships": {
      const who = person(n["user_id"] ?? o["user_id"]);
      if (e.action === "insert") return `${who} joined as ${role(n["role"])}`;
      if (e.action === "delete") {
        return e.actor && e.actor === o["user_id"]
          ? `${who} left the organization`
          : `Removed ${who}`;
      }
      if (n["role"] === "owner" && o["role"] !== "owner") return `Made ${who} the owner`;
      return `Changed ${who}'s role from ${role(o["role"])} to ${role(n["role"])}`;
    }
    case "invitations": {
      const target = n["email"] ?? o["email"] ?? "someone (link invitation)";
      const what =
        (n["role"] ?? o["role"])
          ? role(n["role"] ?? o["role"])
          : `${String(n["app"] ?? o["app"] ?? "")} access`;
      if (e.action === "insert") return `Invited ${target} as ${what}`;
      if (e.action === "delete") return `Removed the invitation for ${target}`;
      if (n["accepted_at"] && !o["accepted_at"]) return `${target} accepted the invitation`;
      if (n["revoked_at"] && !o["revoked_at"]) return `Cancelled the invitation for ${target}`;
      return `Changed the invitation for ${target}`;
    }
    default:
      return `${e.action} on ${e.table_name}`;
  }
}
