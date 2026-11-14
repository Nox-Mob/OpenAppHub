import { describe, expect, it, vi } from "vitest";
import { FriendlyError, deleteAccount, inviteMember } from "./members-core";

const ORG = "11111111-1111-4111-8111-111111111111";

function userClient(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) } as never;
}
function adminClient(error: unknown = null) {
  return {
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => ({ error })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  } as never;
}

describe("inviteMember", () => {
  const base = { orgId: ORG, role: "member" as const, origin: "https://openapphub.org/" };

  it("creates the invitation as the user and emails a link back to /invite", async () => {
    const uc = userClient({ data: [{ invitation_id: "i", token: "tok123" }], error: null });
    const ac = adminClient();
    const res = await inviteMember({
      ...base,
      userClient: uc,
      adminClient: ac,
      email: "  New@Example.org ",
    });
    expect(res).toEqual({ link: "https://openapphub.org/invite/tok123", email: "sent" });
    expect((uc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "create_invitation",
      {
        p_org: ORG,
        p_email: "new@example.org",
        p_role: "member",
      },
    );
    expect(
      (ac as unknown as { auth: { admin: { inviteUserByEmail: ReturnType<typeof vi.fn> } } }).auth
        .admin.inviteUserByEmail,
    ).toHaveBeenCalledWith("new@example.org", {
      redirectTo: "https://openapphub.org/invite/tok123",
    });
  });

  it("existing accounts get the link to share instead of an email", async () => {
    const res = await inviteMember({
      ...base,
      userClient: userClient({ data: [{ token: "t" }], error: null }),
      adminClient: adminClient({
        code: "email_exists",
        message: "A user with this email address has already been registered",
      }),
      email: "bob@example.org",
    });
    expect(res.email).toBe("existing");
  });

  it("works without email configured (self-hosted or no service key)", async () => {
    const res = await inviteMember({
      ...base,
      userClient: userClient({ data: [{ token: "t" }], error: null }),
      adminClient: null,
      email: "bob@example.org",
    });
    expect(res).toEqual({ link: "https://openapphub.org/invite/t", email: "unavailable" });
  });

  it("passes on the database's refusal and rejects bad emails before calling it", async () => {
    await expect(
      inviteMember({
        ...base,
        userClient: userClient({
          data: null,
          error: { message: "Only the owner or an admin can invite people." },
        }),
        adminClient: adminClient(),
        email: "bob@example.org",
      }),
    ).rejects.toThrow("Only the owner or an admin can invite people.");
    const uc = userClient({ data: [], error: null });
    await expect(
      inviteMember({ ...base, userClient: uc, adminClient: null, email: "nope" }),
    ).rejects.toBeInstanceOf(FriendlyError);
    expect((uc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });
});

function accountClient(
  owned: { organizations: { name: string } }[],
  recent: { message: string; code: string } | null = null,
) {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (v: unknown) => void) => resolve({ data: owned, error: null }),
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => query,
    rpc: async () => ({ data: null, error: recent }),
  } as never;
}

const TOKEN = "a".repeat(64);

describe("deleteAccount", () => {
  it("is blocked while the user owns an organization, naming it", async () => {
    const ac = adminClient();
    await expect(
      deleteAccount({
        userClient: accountClient([{ organizations: { name: "Riverside" } }]),
        adminClient: ac,
        reauthToken: TOKEN,
      }),
    ).rejects.toThrow(
      "You own Riverside. Transfer ownership or delete it before deleting your account.",
    );
    expect(
      (ac as unknown as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }).auth.admin
        .deleteUser,
    ).not.toHaveBeenCalled();
  });

  it("needs the one-time pass from Confirm it's you", async () => {
    const ac = adminClient();
    await expect(
      deleteAccount({
        userClient: accountClient([], {
          code: "42501",
          message: "For your safety, confirm it's you first.",
        }),
        adminClient: ac,
        reauthToken: TOKEN,
      }),
    ).rejects.toThrow(/confirm it's you/);
    expect(
      (ac as unknown as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }).auth.admin
        .deleteUser,
    ).not.toHaveBeenCalled();
  });

  it("deletes the account with the service role otherwise", async () => {
    const ac = adminClient();
    await deleteAccount({ userClient: accountClient([]), adminClient: ac, reauthToken: TOKEN });
    expect(
      (ac as unknown as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }).auth.admin
        .deleteUser,
    ).toHaveBeenCalledWith("u1");
  });
});
