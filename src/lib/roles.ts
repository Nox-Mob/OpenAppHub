import type { OrgRole } from "@shared/supabase/org";

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_HELP: Record<Exclude<OrgRole, "owner">, string> = {
  admin: "Manages people, invitations and settings",
  member: "Uses the apps and makes changes",
  viewer: "Can see, but not change",
};

/** Owners and admins manage people, invitations and settings. */
export const canManage = (role: OrgRole | null | undefined) => role === "owner" || role === "admin";
