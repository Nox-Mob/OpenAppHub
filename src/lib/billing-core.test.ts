import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BillingError, createCheckout, createPortal, handleWebhook } from "./billing-core";
import subUpdated from "./stripe/fixtures/customer.subscription.updated.json";
import { signStripePayload } from "./stripe/core";

const ORG = "11111111-1111-4111-8111-111111111111";
const PRICE_MAP = JSON.stringify({
  starter: { month: "price_StarterMonth" },
  suite: { month: "price_SuiteMonth", year: "price_SuiteYear" },
});
const CONFIG = { secret: "sk_test_x", priceMap: PRICE_MAP, webhookSecret: "whsec_test" };

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
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
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

describe("createCheckout", () => {
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
    expect(s.calls.map((c) => c.path)).toEqual(["/v1/customers", "/v1/checkout/sessions"]);
    expect(service.rpc).toHaveBeenCalledWith("billing_set_customer", {
      p_org: ORG,
      p_customer: "cus_New",
    });
    const body = decodeURIComponent(s.calls[1]!.body);
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
    expect(s.calls.map((c) => c.path)).toEqual(["/v1/checkout/sessions"]);
    expect(decodeURIComponent(s.calls[0]!.body)).toContain("customer=cus_Old");
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
