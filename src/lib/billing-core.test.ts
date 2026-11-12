import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BillingError,
  clearPriceCache,
  createCheckout,
  createPortal,
  fetchPlanPrices,
  handleWebhook,
} from "./billing-core";
import subUpdated from "./stripe/fixtures/customer.subscription.updated.json";
import { signStripePayload } from "./stripe/core";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONFIG = { secret: "sk_test_x", webhookSecret: "whsec_test" };
const STRIPE_PRICES = [
  {
    id: "price_StarterMonth",
    active: true,
    lookup_key: "starter_month",
    unit_amount: 500,
    currency: "usd",
    recurring: { interval: "month" },
  },
  {
    id: "price_SuiteMonth",
    active: true,
    lookup_key: "suite_month",
    unit_amount: 1000,
    currency: "usd",
    recurring: { interval: "month" },
  },
  {
    id: "price_SuiteYear",
    active: true,
    lookup_key: "suite_year",
    unit_amount: 10000,
    currency: "usd",
    recurring: { interval: "year" },
  },
];

type Rpc = (name: string, args?: Record<string, unknown>) => { data: unknown; error: unknown };

function client(rpc: Rpc, user: { email: string } | null = { email: "owner@example.org" }) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => rpc(name, args)),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { name: "Riverside" }, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

const manager = (status = "trialing") =>
  client((name) =>
    name === "has_role"
      ? { data: true, error: null }
      : name === "get_org_billing"
        ? { data: [{ status }], error: null }
        : { data: null, error: null },
  );

function stripeFetch() {
  const calls: { path: string; body: string }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname;
    if (path === "/v1/prices") {
      calls.push({ path: `GET ${path}`, body: u.search });
      return new Response(JSON.stringify({ data: STRIPE_PRICES }), { status: 200 });
    }
    calls.push({ path, body: String(init.body) });
    const json =
      path === "/v1/customers"
        ? { id: "cus_New" }
        : path === "/v1/checkout/sessions"
          ? { url: "https://checkout.stripe.com/c/pay/cs_test" }
          : { url: "https://billing.stripe.com/p/session/x" };
    return new Response(JSON.stringify(json), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("fetchPlanPrices", () => {
  it("asks Stripe for our lookup keys and caches the answer", async () => {
    clearPriceCache();
    const s = stripeFetch();
    const prices = await fetchPlanPrices({ secret: "sk_test_x", fetchImpl: s.impl, now: 1000 });
    expect(prices.suite?.year?.id).toBe("price_SuiteYear");
    expect(decodeURIComponent(s.calls[0]!.body)).toContain("lookup_keys[0]=starter_month");
    expect(decodeURIComponent(s.calls[0]!.body)).toContain("active=true");
    await fetchPlanPrices({ secret: "sk_test_x", fetchImpl: s.impl, now: 2000 });
    expect(s.calls).toHaveLength(1);
    await fetchPlanPrices({ secret: "sk_test_x", fetchImpl: s.impl, now: 1000 + 6 * 60 * 1000 });
    expect(s.calls).toHaveLength(2);
  });
  it("is empty without a key, and keeps the last answer when Stripe fails", async () => {
    clearPriceCache();
    expect(await fetchPlanPrices({ secret: null })).toEqual({});
    const s = stripeFetch();
    await fetchPlanPrices({ secret: "sk_test_x", fetchImpl: s.impl, now: 0 });
    const failing = vi.fn(
      async () => new Response("{}", { status: 500 }),
    ) as unknown as typeof fetch;
    const again = await fetchPlanPrices({
      secret: "sk_test_x",
      fetchImpl: failing,
      now: 10 * 60 * 1000,
    });
    expect(again.starter?.month?.cents).toBe(500);
  });
});

describe("createCheckout", () => {
  beforeEach(() => clearPriceCache());
  it("refuses a chapter's organization: its parent's plan covers it", async () => {
    const chapter = client((name) =>
      name === "has_role"
        ? { data: true, error: null }
        : name === "billing_parent_org"
          ? { data: [{ id: "p", name: "Delta National" }], error: null }
          : { data: null, error: null },
    );
    await expect(
      createCheckout({
        userClient: chapter,
        service: client(() => ({ data: null, error: null })),
        config: CONFIG,
        orgId: ORG,
        plan: "suite",
        interval: "month",
        origin: "https://openapphub.org",
      }),
    ).rejects.toThrow("covered by Delta National's plan");
  });
  it("creates the customer once and a subscription checkout with the org in metadata", async () => {
    const service = client((name) => ({
      data: name === "billing_customer_for_org" ? null : null,
      error: null,
    }));
    const s = stripeFetch();
    const res = await createCheckout({
      userClient: manager(),
      service,
      config: CONFIG,
      orgId: ORG,
      plan: "starter",
      interval: "month",
      app: "board",
      origin: "https://openapphub.org/",
      fetchImpl: s.impl,
    });
    expect(res.url).toContain("checkout.stripe.com");
    expect(s.calls.map((c) => c.path)).toEqual([
      "GET /v1/prices",
      "/v1/customers",
      "/v1/checkout/sessions",
    ]);
    expect(service.rpc).toHaveBeenCalledWith("billing_set_customer", {
      p_org: ORG,
      p_customer: "cus_New",
    });
    const body = decodeURIComponent(s.calls[2]!.body);
    expect(body).toContain("mode=subscription");
    expect(body).toContain(`client_reference_id=${ORG}`);
    expect(body).toContain("line_items[0][price]=price_StarterMonth");
    expect(body).toContain("subscription_data[metadata][apps]=board");
    expect(body).toContain("success_url=https://openapphub.org/billing?checkout=done");
  });
  it("reuses an existing customer", async () => {
    const service = client((name) => ({
      data: name === "billing_customer_for_org" ? "cus_Old" : null,
      error: null,
    }));
    const s = stripeFetch();
    await createCheckout({
      userClient: manager(),
      service,
      config: CONFIG,
      orgId: ORG,
      plan: "suite",
      interval: "year",
      origin: "https://openapphub.org",
      fetchImpl: s.impl,
    });
    expect(s.calls.map((c) => c.path)).toEqual(["GET /v1/prices", "/v1/checkout/sessions"]);
    expect(decodeURIComponent(s.calls[1]!.body)).toContain("customer=cus_Old");
  });
  it("refuses members, missing setup, Starter without an app, and a second subscription", async () => {
    const base = { config: CONFIG, orgId: ORG, origin: "https://x", fetchImpl: stripeFetch().impl };
    const service = client(() => ({ data: null, error: null }));
    const member = client((n) => ({ data: n === "has_role" ? false : null, error: null }));
    await expect(
      createCheckout({ ...base, userClient: member, service, plan: "suite", interval: "month" }),
    ).rejects.toThrow("Only the owner or an admin");
    await expect(
      createCheckout({ ...base, userClient: manager(), service, plan: "plus", interval: "month" }),
    ).rejects.toThrow("isn't available yet");
    await expect(
      createCheckout({
        ...base,
        config: { ...CONFIG, secret: null },
        userClient: manager(),
        service,
        plan: "suite",
        interval: "month",
      }),
    ).rejects.toThrow("Payments aren't set up");
    await expect(
      createCheckout({
        ...base,
        userClient: manager(),
        service: null,
        plan: "suite",
        interval: "month",
      }),
    ).rejects.toThrow(BillingError);
    await expect(
      createCheckout({
        ...base,
        userClient: manager(),
        service,
        plan: "starter",
        interval: "month",
      }),
    ).rejects.toThrow("Choose the app");
    await expect(
      createCheckout({
        ...base,
        userClient: manager("active"),
        service,
        plan: "suite",
        interval: "month",
      }),
    ).rejects.toThrow("Manage billing");
  });
});

describe("createPortal", () => {
  it("opens the portal for the org's customer", async () => {
    const s = stripeFetch();
    const service = client(() => ({ data: "cus_Old", error: null }));
    const res = await createPortal({
      userClient: manager(),
      service,
      config: CONFIG,
      orgId: ORG,
      origin: "https://openapphub.org",
      fetchImpl: s.impl,
    });
    expect(res.url).toContain("billing.stripe.com");
    expect(decodeURIComponent(s.calls[0]!.body)).toBe(
      "customer=cus_Old&return_url=https://openapphub.org/billing",
    );
  });
  it("explains when there's no customer yet", async () => {
    const service = client(() => ({ data: null, error: null }));
    await expect(
      createPortal({
        userClient: manager(),
        service,
        config: CONFIG,
        orgId: ORG,
        origin: "https://x",
      }),
    ).rejects.toThrow("Choose a plan first");
  });
});

describe("handleWebhook", () => {
  const payload = JSON.stringify(subUpdated);
  const now = 1_800_000_000;
  const sign = () => signStripePayload(payload, CONFIG.webhookSecret, now);

  it("applies a verified event once", async () => {
    const seen = new Set<string>();
    const service = client((name, args) => {
      if (name === "billing_record_event") {
        const fresh = !seen.has(String(args!["p_id"]));
        seen.add(String(args!["p_id"]));
        return { data: fresh, error: null };
      }
      return { data: ORG, error: null };
    });
    const first = await handleWebhook({
      payload,
      signature: await sign(),
      service,
      config: CONFIG,
      now,
    });
    expect(first.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith(
      "billing_apply_subscription",
      expect.objectContaining({
        p_org: ORG,
        p_plan: "suite",
        p_status: "active",
        p_subscription: "sub_Riverside",
      }),
    );
    const again = await handleWebhook({
      payload,
      signature: await sign(),
      service,
      config: CONFIG,
      now,
    });
    expect(again).toEqual({ status: 200, body: "duplicate" });
    expect(service.rpc.mock.calls.filter(([n]) => n === "billing_apply_subscription")).toHaveLength(
      1,
    );
  });
  it("refuses a bad signature and needs configuration", async () => {
    const service = client(() => ({ data: true, error: null }));
    expect(
      (await handleWebhook({ payload, signature: "t=1,v1=00", service, config: CONFIG, now }))
        .status,
    ).toBe(400);
    expect(
      (
        await handleWebhook({
          payload,
          signature: await sign(),
          service: null,
          config: CONFIG,
          now,
        })
      ).status,
    ).toBe(503);
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("forgets the event when applying fails, so Stripe's retry runs it", async () => {
    const service = client((name) =>
      name === "billing_record_event"
        ? { data: true, error: null }
        : name === "billing_apply_subscription"
          ? { data: null, error: { message: "boom" } }
          : { data: null, error: null },
    );
    const res = await handleWebhook({
      payload,
      signature: await sign(),
      service,
      config: CONFIG,
      now,
    });
    expect(res.status).toBe(500);
    expect(service.rpc).toHaveBeenCalledWith("billing_forget_event", { p_id: "evt_1SubUpdated" });
  });
});
