import type { OrgRole } from "@shared/supabase/org";

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/** A role in one app (core 0015): an OpenAppHub role, or "none" for No access there. */
export type AppRole = OrgRole | "none";
export const APP_ROLE_LABEL: Record<AppRole, string> = { ...ROLE_LABEL, none: "No access" };

/** The OpenAppHub role (H-09): what someone can do in OpenAppHub itself, not in the apps. */
export const ROLE_HELP: Record<Exclude<OrgRole, "owner">, string> = {
  admin:
    "Manages people, invitations, roles, billing and settings in OpenAppHub. Not an admin in the apps unless given that role there.",
  member: "Sees the dashboard and their tasks. What they can do in each app is set separately.",
  viewer: "Sees the dashboard. What they can do in each app is set separately.",
};

/** In an app: what each role can do there. */
export const APP_ROLE_HELP: Record<Exclude<AppRole, "owner">, string> = {
  admin: "Everything in the app, including its settings",
  member: "Uses the app and makes changes",
  viewer: "Can see, but not change",
  none: "No access: the app doesn't open for them and they see nothing in it. They stay in the organization and keep their roles in the other apps.",
};

/** Owners and OpenAppHub admins manage people, invitations, roles, billing and settings. */
export const canManage = (role: OrgRole | null | undefined) => role === "owner" || role === "admin";

/** Shown before someone is allowed to build workflows (owner direction, 2026-11-12). */
export const WORKFLOWS_RUN_AS_ORG =
  "Workflows run as the organization, not as the person who built them. Someone who can build workflows can look up and change information in every app this organization uses, through a workflow, whatever their own role in those apps.";
