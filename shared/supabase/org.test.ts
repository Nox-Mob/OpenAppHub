import { describe, expect, it } from "vitest";
import { billingNotice, daysLeft, hasAppAccess, isReadOnly, type OrgBilling } from "./billing";
import { appOrgUrl } from "../apps";
import {
  getOrgPreferences,
  listMyOrgs,
  orgCookieString,
  orgFromSearch,
  readOrgCookie,
  resolveCurrentOrg,
  withOrg,
} from "./org";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("org cookie", () => {
  it("reads a valid id among other cookies", () => {
    expect(readOrgCookie(`a=1; oah_org=${A}; b=2`)).toBe(A);
    expect(readOrgCookie(`oah_org=${A.toUpperCase()}`)).toBe(A);
  });

  it("ignores missing or malformed values", () => {
    expect(readOrgCookie("")).toBeNull();
    expect(readOrgCookie("oah_org=not-a-uuid")).toBeNull();
    expect(readOrgCookie(`xoah_org=${A}`)).toBeNull();
  });

  it("builds the cookie, suite-wide when given a domain", () => {
    expect(orgCookieString(A, { domain: ".openapphub.org", secure: true })).toBe(
      `oah_org=${A}; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.openapphub.org; Secure`,
    );
    expect(() => orgCookieString("x; Domain=evil.example")).toThrow();
  });
});

describe("resolveCurrentOrg", () => {
  const orgs = [
    { id: B, name: "Zeta Club" },
    { id: A, name: "Alpha Association" },
  ];

  it("uses the cookie only when the user is a member", () => {
    expect(resolveCurrentOrg(orgs, B)?.id).toBe(B);
    expect(resolveCurrentOrg(orgs, "33333333-3333-4333-8333-333333333333")?.id).toBe(A);
  });

  it("falls back to the first org by name, or null", () => {
    expect(resolveCurrentOrg(orgs, null)?.name).toBe("Alpha Association");
    expect(resolveCurrentOrg([], A)).toBeNull();
  });

  it("uses the person's default organization when nothing is picked (H-03)", () => {
    expect(resolveCurrentOrg(orgs, null, B)?.id).toBe(B);
    expect(resolveCurrentOrg(orgs, A, B)?.id).toBe(A);
    expect(resolveCurrentOrg(orgs, null, "33333333-3333-4333-8333-333333333333")?.id).toBe(A);
  });
});

const now = new Date("2026-11-09T12:00:00Z");
const base: OrgBilling = {
  plan_id: null,
  status: "trialing",
  apps: [],
  trial_ends_at: "2026-11-21T12:00:00Z",
  current_period_end: null,
  cancel_at_period_end: false,
};

describe("hasAppAccess (mirrors billing.org_has_app_access)", () => {
  it("trial: every app until it ends", () => {
    expect(hasAppAccess(base, "board", now)).toBe(true);
    expect(hasAppAccess({ ...base, trial_ends_at: "2026-11-01T00:00:00Z" }, "board", now)).toBe(
      false,
    );
  });

  it("paid: only the plan's apps; past_due keeps access", () => {
    const starter = { ...base, status: "active" as const, plan_id: "starter", apps: ["board"] };
    expect(hasAppAccess(starter, "board", now)).toBe(true);
    expect(hasAppAccess(starter, "ledger", now)).toBe(false);
    expect(hasAppAccess({ ...starter, status: "past_due" }, "board", now)).toBe(true);
  });

  it("lapsed: no app; the hub is always reachable", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "expired"] as const) {
      expect(hasAppAccess({ ...base, status }, "charter", now)).toBe(false);
    }
    expect(hasAppAccess({ ...base, status: "expired" }, "hub", now)).toBe(true);
  });
});

describe("billingNotice", () => {
  it("no billing (self-hosted) or paid and fine: no banner", () => {
    expect(billingNotice(null, "board")).toBeNull();
    expect(
      billingNotice({ ...base, status: "active", apps: ["board"] }, "board", {
        canManage: true,
        now,
      }),
    ).toBeNull();
  });

  it("trial: days left, warning near the end", () => {
    expect(billingNotice(base, "board", { canManage: true, now })).toMatchObject({
      tone: "info",
      message: "Your free trial ends in 12 days.",
      action: "Choose a plan",
      readOnly: false,
    });
    const soon = { ...base, trial_ends_at: "2026-11-10T06:00:00Z" };
    expect(billingNotice(soon, "board", { canManage: false, now })).toMatchObject({
      tone: "warning",
      message: "Your free trial ends in 1 day.",
      action: "See plans",
    });
  });

  it("read-only explains why and that export still works", () => {
    const ended = billingNotice({ ...base, trial_ends_at: "2026-11-01T00:00:00Z" }, "ledger", {
      canManage: true,
      now,
    });
    expect(ended).toMatchObject({ tone: "danger", readOnly: true });
    expect(ended?.message).toContain("free trial has ended");
    expect(ended?.message).toContain("export");

    const notInPlan = billingNotice({ ...base, status: "active", apps: ["board"] }, "ledger", {
      canManage: true,
      now,
    });
    expect(notInPlan?.message).toContain("isn't in your organization's plan");
  });

  it("past due and cancelling", () => {
    expect(
      billingNotice({ ...base, status: "past_due", apps: ["board"] }, "board", {
        canManage: true,
        now,
      })?.action,
    ).toBe("Update payment");
    expect(
      billingNotice(
        {
          ...base,
          status: "active",
          apps: ["board"],
          cancel_at_period_end: true,
          current_period_end: "2026-11-16T12:00:00Z",
        },
        "board",
        { canManage: true, now },
      )?.message,
    ).toBe("Your plan is cancelled and ends in 7 days. After that, the apps become read-only.");
  });

  it("daysLeft never goes negative", () => {
    expect(daysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });
});

describe("getOrgPreferences", () => {
  const client = (result: unknown) =>
    ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
      }),
    }) as never;
  it("reads the org's time zone and currency", async () => {
    expect(
      await getOrgPreferences(
        client({ data: { time_zone: "America/Toronto", currency: "CAD" }, error: null }),
        A,
      ),
    ).toEqual({ timeZone: "America/Toronto", currency: "CAD" });
  });
  it("falls back to UTC and USD on an older core", async () => {
    expect(
      await getOrgPreferences(client({ data: null, error: { message: "column missing" } }), A),
    ).toEqual({ timeZone: "UTC", currency: "USD" });
  });
});

describe("opening an app in an organization", () => {
  const id = "de000000-0000-4000-8000-0000000000a1";

  it("reads ?org= only when it's an organization id", () => {
    expect(orgFromSearch(`?org=${id.toUpperCase()}&x=1`)).toBe(id);
    expect(orgFromSearch("?org=not-an-id")).toBeNull();
    expect(orgFromSearch("")).toBeNull();
  });

  it("adds ?org= to absolute and relative links", () => {
    expect(withOrg("https://board.example.org/board?tab=1", id)).toBe(
      `https://board.example.org/board?tab=1&org=${id}`,
    );
    expect(withOrg("/ledger", id)).toBe(`/ledger?org=${id}`);
    expect(withOrg("/ledger", "nope")).toBe("/ledger");
  });

  it("links each app straight into the organization", () => {
    expect(appOrgUrl("charter", "https://charter.example.org/", id)).toBe(
      `https://charter.example.org/orgs/${id}`,
    );
    expect(appOrgUrl("board", "https://board.example.org", id)).toBe(
      `https://board.example.org/board?org=${id}`,
    );
    expect(appOrgUrl("ledger", "https://ledger.example.org", id)).toBe(
      `https://ledger.example.org/ledger?org=${id}`,
    );
    expect(appOrgUrl("hub", "https://example.org", id)).toBe("https://example.org");
    expect(appOrgUrl("board", "https://board.example.org", null)).toBe("https://board.example.org");
  });
});

describe("isReadOnly (S-05: write controls off)", () => {
  it("no billing (self-hosted) is never read-only", () => {
    expect(isReadOnly(null, "board", now)).toBe(false);
    expect(isReadOnly(undefined, "board", now)).toBe(false);
  });

  it("read-only exactly when the app has no access", () => {
    expect(isReadOnly(base, "board", now)).toBe(false);
    expect(isReadOnly({ ...base, trial_ends_at: "2026-11-01T00:00:00Z" }, "board", now)).toBe(true);
    const starter = { ...base, status: "active" as const, plan_id: "starter", apps: ["board"] };
    expect(isReadOnly(starter, "ledger", now)).toBe(true);
    expect(isReadOnly({ ...base, status: "canceled" as const }, "hub", now)).toBe(false);
  });
});

describe("listMyOrgs", () => {
  const member = (rows: unknown[], failParent = false) => {
    const calls: string[] = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => ({
        select: (cols: string) => {
          calls.push(`${table}:${cols}`);
          const result =
            table === "memberships"
              ? failParent && cols.includes("parent_org_id")
                ? {
                    data: null,
                    error: { message: "column organizations_1.parent_org_id does not exist" },
                  }
                : { data: rows, error: null }
              : { data: [{ id: "nat", name: "Delta National" }], error: null };
          return { eq: async () => result, in: async () => result };
        },
      }),
    };
    return { client: client as never, calls };
  };

  it("adds a chapter's parent", async () => {
    const { client } = member([
      {
        role: "owner",
        organizations: { id: "c1", name: "Chapter 12", slug: null, parent_org_id: "nat" },
      },
      {
        role: "admin",
        organizations: { id: "nat", name: "Delta National", slug: null, parent_org_id: null },
      },
    ]);
    const orgs = await listMyOrgs(client);
    expect(orgs.find((o) => o.id === "c1")?.parent).toEqual({ id: "nat", name: "Delta National" });
    expect(orgs.find((o) => o.id === "nat")?.parent).toBeUndefined();
  });

  it("works on a database without child organizations", async () => {
    const { client, calls } = member(
      [{ role: "owner", organizations: { id: "o1", name: "Org", slug: null } }],
      true,
    );
    expect(await listMyOrgs(client)).toEqual([
      { id: "o1", name: "Org", slug: null, role: "owner" },
    ]);
    expect(calls).toHaveLength(2);
  });
});
