import { describe, expect, it } from "vitest";
import { billingNotice, daysLeft, hasAppAccess, type OrgBilling } from "./billing";
import { getOrgPreferences, orgCookieString, readOrgCookie, resolveCurrentOrg } from "./org";

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
