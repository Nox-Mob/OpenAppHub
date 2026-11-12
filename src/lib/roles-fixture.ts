// Sample people and roles for the dev preview (/dev/hub?screen=roles) and the browser tests:
// an organization with a named role, a role set for one app, and someone with nothing set.
import type { AppRoles } from "./people";

export const FIXTURE_MEMBERS = [
  {
    user_id: "u-owner",
    display_name: "Olive Owner",
    email: "olive@example.org",
    role: "owner" as const,
  },
  {
    user_id: "u-tres",
    display_name: "Terry Treasurer",
    email: "terry@example.org",
    role: "member" as const,
  },
  {
    user_id: "u-admin",
    display_name: "Ada Admin",
    email: "ada@example.org",
    role: "admin" as const,
  },
  { user_id: "u-new", display_name: "Nia New", email: "nia@example.org", role: "member" as const },
];

const TREASURER = {
  id: "nr-treasurer",
  name: "Treasurer",
  description: "Keeps the books",
  app_roles: { ledger: "admin" as const, board: "member" as const, charter: "member" as const },
  permissions: { charter: ["payments.view"] },
};

export const FIXTURE_ROLES: AppRoles = {
  charter: new Map(),
  board: new Map([["u-tres", "treasurer"]]),
  ledger: new Map(),
  overrides: new Map([["board:u-admin", "admin" as const]]),
  resolved: new Map([
    ["charter:u-tres", { role: "member" as const, source: "named" as const }],
    ["board:u-tres", { role: "member" as const, source: "named" as const }],
    ["ledger:u-tres", { role: "admin" as const, source: "named" as const }],
    ["charter:u-admin", { role: "viewer" as const, source: "fallback" as const }],
    ["board:u-admin", { role: "admin" as const, source: "person" as const }],
    ["ledger:u-admin", { role: "viewer" as const, source: "fallback" as const }],
    ["charter:u-new", { role: "viewer" as const, source: "fallback" as const }],
    ["board:u-new", { role: "viewer" as const, source: "fallback" as const }],
    ["ledger:u-new", { role: "viewer" as const, source: "fallback" as const }],
  ]),
  namedRoleOf: new Map([["u-tres", "nr-treasurer"]]),
  namedRoles: [TREASURER],
  permissionTypes: [
    { app: "charter", key: "payments.view", label: "See payments", description: "", sort: 100 },
    { app: "charter", key: "members.manage", label: "Manage members", description: "", sort: 100 },
    {
      app: "board",
      key: "board.edit_records",
      label: "Edit the official record",
      description: "What the chair and secretary can do.",
      sort: 10,
    },
    {
      app: "ledger",
      key: "ledger.close_books",
      label: "Close the books",
      description: "What a treasurer can do.",
      sort: 10,
    },
  ],
  workflowEditors: new Set(),
};
