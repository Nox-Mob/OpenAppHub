import { describe, expect, it } from "vitest";
import checkoutDone from "./fixtures/checkout.session.completed.json";
import subDeleted from "./fixtures/customer.subscription.deleted.json";
import subUpdated from "./fixtures/customer.subscription.updated.json";
import invoiceFailed from "./fixtures/invoice.payment_failed.json";
import {
  eventToAction,
  formEncode,
  mapStatus,
  parseApps,
  appsForPlan,
  planAmounts,
  planFromLookupKey,
  toPlanPrices,
  signStripePayload,
  verifyStripeSignature,
  type StripeEvent,
} from "./core";

const ORG = "11111111-1111-4111-8111-111111111111";
const PRICES = toPlanPrices([
  {
    id: "price_SM",
    active: true,
    lookup_key: "starter_month",
    unit_amount: 500,
    currency: "usd",
    recurring: { interval: "month" },
  },
  {
    id: "price_SY",
    active: true,
    lookup_key: "suite_year",
    unit_amount: 10000,
    currency: "usd",
    recurring: { interval: "year" },
  },
  {
    id: "price_wrong",
    active: true,
    lookup_key: "plus_year",
    unit_amount: 1,
    recurring: { interval: "month" },
  },
  {
    id: "price_old",
    active: false,
    lookup_key: "plus_month",
    unit_amount: 2,
    recurring: { interval: "month" },
  },
  {
    id: "price_gold",
    active: true,
    lookup_key: "gold_month",
    unit_amount: 3,
    recurring: { interval: "month" },
  },
  {
    id: "price_none",
    active: true,
    lookup_key: null,
    unit_amount: 4,
    recurring: { interval: "month" },
  },
]);

describe("prices by lookup key", () => {
  it("keeps active prices whose key matches a plan and its interval", () => {
    expect(PRICES).toEqual({
      starter: { month: { id: "price_SM", cents: 500, currency: "usd" } },
      suite: { year: { id: "price_SY", cents: 10000, currency: "usd" } },
    });
    expect(planAmounts(PRICES)).toEqual({ starter: { month: 500 }, suite: { year: 10000 } });
    expect(toPlanPrices("nope")).toEqual({});
  });
  it("reads plan and interval from a lookup key", () => {
    expect(planFromLookupKey("suite_year")).toEqual({ plan: "suite", interval: "year" });
    expect(planFromLookupKey("suite_week")).toBeNull();
    expect(planFromLookupKey(undefined)).toBeNull();
  });
  it("Suite and Plus give every app; Starter one", () => {
    expect(appsForPlan("suite", ["board"])).toEqual(["charter", "board", "ledger"]);
    expect(appsForPlan("plus", [])).toEqual(["charter", "board", "ledger"]);
    expect(appsForPlan("starter", ["ledger", "board"])).toEqual(["ledger"]);
    expect(appsForPlan(null, ["board"])).toEqual(["board"]);
  });
});

describe("webhook signature", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "x" });
  it("accepts Stripe's signature within the tolerance", async () => {
    const header = await signStripePayload(payload, secret, 1_800_000_000);
    expect(await verifyStripeSignature({ payload, header, secret, now: 1_800_000_100 })).toBe(true);
  });
  it("refuses a changed payload, a wrong secret, an old timestamp or no header", async () => {
    const header = await signStripePayload(payload, secret, 1_800_000_000);
    const now = 1_800_000_000;
    expect(await verifyStripeSignature({ payload: payload + " ", header, secret, now })).toBe(
      false,
    );
    expect(await verifyStripeSignature({ payload, header, secret: "whsec_other", now })).toBe(
      false,
    );
    expect(await verifyStripeSignature({ payload, header, secret, now: now + 301 })).toBe(false);
    expect(await verifyStripeSignature({ payload, header: null, secret, now })).toBe(false);
    expect(await verifyStripeSignature({ payload, header: "t=abc,v1=00", secret, now })).toBe(
      false,
    );
  });
  it("accepts any of several v1 signatures (secret rotation)", async () => {
    const good = await signStripePayload(payload, secret, 1_800_000_000);
    const header = `t=1800000000,v1=${"0".repeat(64)},${good.split(",")[1]}`;
    expect(await verifyStripeSignature({ payload, header, secret, now: 1_800_000_000 })).toBe(true);
  });
});

describe("events → billing rows (Stripe fixtures)", () => {
  it("checkout.session.completed: the org, plan and app from the checkout", () => {
    expect(eventToAction(checkoutDone as StripeEvent)).toEqual({
      kind: "subscription",
      org: ORG,
      customer: "cus_Riverside",
      subscription: "sub_Riverside",
      plan: "starter",
      status: "active",
      apps: ["board"],
      periodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });
  it("customer.subscription.updated: the price's lookup key decides the plan and apps", () => {
    expect(eventToAction(subUpdated as StripeEvent)).toEqual({
      kind: "subscription",
      org: ORG,
      customer: "cus_Riverside",
      subscription: "sub_Riverside",
      plan: "suite",
      status: "active",
      apps: ["charter", "board", "ledger"],
      periodEnd: new Date(1797811200 * 1000).toISOString(),
      cancelAtPeriodEnd: true,
    });
  });
  it("customer.subscription.deleted: canceled, found by subscription id", () => {
    const a = eventToAction(subDeleted as StripeEvent);
    expect(a).toMatchObject({
      kind: "subscription",
      org: null,
      subscription: "sub_Riverside",
      plan: "suite",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
  });
  it("invoice.payment_failed: past due (new and old API shapes)", () => {
    expect(eventToAction(invoiceFailed as StripeEvent)).toEqual({
      kind: "status",
      subscription: "sub_Riverside",
      status: "past_due",
    });
    const old = {
      id: "evt_old",
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_Old" } },
    };
    expect(eventToAction(old)).toEqual({
      kind: "status",
      subscription: "sub_Old",
      status: "past_due",
    });
  });
  it("ignores one-off payments and other events", () => {
    const payment = {
      id: "evt_p",
      type: "checkout.session.completed",
      data: { object: { mode: "payment" } },
    };
    expect(eventToAction(payment).kind).toBe("ignore");
    expect(eventToAction({ id: "e", type: "charge.refunded", data: { object: {} } }).kind).toBe(
      "ignore",
    );
  });
  it("rejects org ids that aren't UUIDs", () => {
    const evt = structuredClone(checkoutDone) as StripeEvent;
    evt.data.object["client_reference_id"] = "'; drop table";
    (evt.data.object["metadata"] as Record<string, string>)["org_id"] = "nope";
    expect(eventToAction(evt)).toMatchObject({ org: null });
  });
});

describe("helpers", () => {
  it("maps Stripe statuses", () => {
    expect(mapStatus("incomplete_expired")).toBe("expired");
    expect(mapStatus("paused")).toBe("unpaid");
    expect(mapStatus("active")).toBe("active");
    expect(mapStatus("weird")).toBe("incomplete");
  });
  it("parses apps from metadata", () => {
    expect(parseApps("board, ledger,board,hub")).toEqual(["board", "ledger"]);
    expect(parseApps(undefined)).toEqual([]);
  });
  it("form-encodes nested params like Stripe", () => {
    expect(
      formEncode({
        mode: "subscription",
        line_items: [{ price: "price_1", quantity: 1 }],
        metadata: { org_id: "o", apps: "a,b" },
        skip: undefined,
      }),
    ).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Borg_id%5D=o&metadata%5Bapps%5D=a%2Cb",
    );
  });
});
