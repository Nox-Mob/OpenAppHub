import { describe, expect, it } from "vitest";
import { describeAudit, type AuditEntry } from "./audit-describe";

const base: AuditEntry = {
  id: 1,
  at: "2026-11-09T10:00:00Z",
  actor: "a",
  actor_name: "Alice",
  action: "insert",
  table_name: "organizations",
  row_key: null,
  old_data: null,
  new_data: null,
};
const names = { a: "Alice", b: "Bob" };

describe("describeAudit", () => {
  it.each<[Partial<AuditEntry>, string]>([
    [{ new_data: { name: "Riverside" } }, "Created the organization “Riverside”"],
    [
      { action: "update", old_data: { name: "A" }, new_data: { name: "B" } },
      "Renamed the organization from “A” to “B”",
    ],
    [
      { table_name: "memberships", new_data: { user_id: "b", role: "member" } },
      "Bob joined as Member",
    ],
    [
      {
        table_name: "memberships",
        action: "update",
        old_data: { user_id: "b", role: "member" },
        new_data: { user_id: "b", role: "admin" },
      },
      "Changed Bob's role from Member to Admin",
    ],
    [
      {
        table_name: "memberships",
        action: "update",
        old_data: { user_id: "b", role: "admin" },
        new_data: { user_id: "b", role: "owner" },
      },
      "Made Bob the owner",
    ],
    [{ table_name: "memberships", action: "delete", old_data: { user_id: "b" } }, "Removed Bob"],
    [
      { table_name: "memberships", action: "delete", actor: "b", old_data: { user_id: "b" } },
      "Bob left the organization",
    ],
    [
      { table_name: "memberships", action: "delete", old_data: { user_id: "zz" } },
      "Removed a former member",
    ],
    [
      { table_name: "invitations", new_data: { email: "c@example.org", role: "viewer" } },
      "Invited c@example.org as Viewer",
    ],
    [
      { table_name: "invitations", new_data: { email: null, role: null, app: "charter" } },
      "Invited someone (link invitation) as charter access",
    ],
    [
      {
        table_name: "invitations",
        action: "update",
        old_data: { email: "c@example.org" },
        new_data: { email: "c@example.org", accepted_at: "x" },
      },
      "c@example.org accepted the invitation",
    ],
    [
      {
        table_name: "invitations",
        action: "update",
        old_data: { email: "c@example.org" },
        new_data: { email: "c@example.org", revoked_at: "x" },
      },
      "Cancelled the invitation for c@example.org",
    ],
  ])("%j", (patch, text) => {
    expect(describeAudit({ ...base, ...patch }, names)).toBe(text);
  });
});
