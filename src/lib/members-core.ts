// Invitation and account-deletion logic, with the Supabase clients passed in
// so it can be tested without a server. The database enforces the rules
// (create_invitation needs owner/admin; an owner's account can't be deleted);
// these functions add the email and the friendly errors.
import type { SupabaseClient } from "@supabase/supabase-js";

export type InviteRole = "admin" | "member" | "viewer";

export type InviteResult = {
  link: string;
  /** "sent": Supabase emailed a sign-up invitation. "existing": they already
   *  have an account, so share the link yourself. "unavailable": email isn't
   *  configured on this server; share the link yourself. */
  email: "sent" | "existing" | "unavailable";
};

export class FriendlyError extends Error {}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function inviteMember(opts: {
  userClient: SupabaseClient;
  adminClient: SupabaseClient | null;
  orgId: string;
  email: string;
  role: InviteRole;
  /** H-09: the named role and/or each app's role they get (unset: viewer in that app). */
  namedRoleId?: string | null | undefined;
  appRoles?: Record<string, string> | undefined;
  origin: string;
}): Promise<InviteResult> {
  const email = opts.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new FriendlyError("Enter a valid email address.");

  const { data, error } = await opts.userClient.rpc("create_invitation", {
    p_org: opts.orgId,
    p_email: email,
    p_role: opts.role,
  });
  if (error) throw new FriendlyError(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    { token?: string; invitation_id?: string } | undefined;
  if (!row?.token) throw new FriendlyError("The invitation couldn't be created.");
  const appRoles = Object.fromEntries(
    Object.entries(opts.appRoles ?? {}).filter(
      ([, v]) => v === "admin" || v === "member" || v === "viewer",
    ),
  );
  if (opts.namedRoleId || Object.keys(appRoles).length > 0) {
    const { error: rolesError } = await opts.userClient.rpc("set_invitation_roles", {
      p_invitation: row.invitation_id,
      p_named_role: opts.namedRoleId ?? null,
      p_app_roles: appRoles,
    });
    if (rolesError) {
      // Don't leave an invitation behind with less access than was chosen.
      await opts.userClient.rpc("revoke_invitation", { p_id: row.invitation_id });
      throw new FriendlyError(rolesError.message);
    }
  }
  const link = `${opts.origin.replace(/\/$/, "")}/invite/${row.token}`;

  if (!opts.adminClient) return { link, email: "unavailable" };
  const { error: mailError } = await opts.adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: link,
  });
  if (!mailError) return { link, email: "sent" };
  const code = (mailError as { code?: string }).code;
  if (code === "email_exists" || /already (been )?registered/i.test(mailError.message)) {
    return { link, email: "existing" };
  }
  // Don't fail the invitation over the email: the link still works.
  console.error("inviteUserByEmail failed:", code ?? mailError.message);
  return { link, email: "unavailable" };
}

export async function deleteAccount(opts: {
  userClient: SupabaseClient;
  adminClient: SupabaseClient | null;
}): Promise<void> {
  const { data: auth } = await opts.userClient.auth.getUser();
  const user = auth.user;
  if (!user) throw new FriendlyError("You need to be signed in.");
  const { data: owned, error } = await opts.userClient
    .from("memberships")
    .select("org_id, organizations(name)")
    .eq("user_id", user.id)
    .eq("role", "owner");
  if (error) throw new FriendlyError(error.message);
  if (owned && owned.length > 0) {
    const names = (owned as unknown as { organizations: { name: string } | null }[])
      .map((o) => o.organizations?.name)
      .filter(Boolean)
      .join(", ");
    throw new FriendlyError(
      `You own ${names || "an organization"}. Transfer ownership or delete it before deleting your account.`,
    );
  }
  if (!opts.adminClient)
    throw new FriendlyError("Account deletion isn't available on this server.");
  const { error: delError } = await opts.adminClient.auth.admin.deleteUser(user.id);
  if (delError) throw new FriendlyError("Your account couldn't be deleted. Try again later.");
}
