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
  parsePriceMap,
  planForPrice,
  priceFor,
  signStripePayload,
  verifyStripeSignature,
  type StripeEvent,
} from "./core";

const ORG = "11111111-1111-4111-8111-111111111111";
const MAP = parsePriceMap(
  JSON.stringify({
    starter: { month: "price_StarterMonth", year: "price_StarterYear" },
    suite: { month: "price_SuiteMonth", year: "price_SuiteYear" },
    plus: { month: "price_PlusMonth", year: "bad value" },
    gold: { month: "price_Gold" },
  }),
);

describe("price map", () => {
  it("keeps only known plans and valid price ids", () => {
    expect(MAP).toEqual({
      starter: { month: "price_StarterMonth", year: "price_StarterYear" },
      suite: { month: "price_SuiteMonth", year: "price_SuiteYear" },
      plus: { month: "price_PlusMonth" },
    });
    expect(priceFor(MAP!, "plus", "year")).toBeNull();
    expect(planForPrice(MAP!, "price_SuiteYear")).toEqual({ plan: "suite", interval: "year" });
    expect(planForPrice(MAP!, "price_unknown")).toBeNull();
  });
  it("is null when missing or not JSON", () => {
    expect(parsePriceMap(undefined)).toBeNull();
    expect(parsePriceMap("not json")).toBeNull();
    expect(parsePriceMap("{}")).toBeNull();
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
    expect(eventToAction(checkoutDone as StripeEvent, MAP)).toEqual({
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
  it("customer.subscription.updated: the price decides the plan; period end from the item", () => {
    expect(eventToAction(subUpdated as StripeEvent, MAP)).toEqual({
      kind: "subscription",
      org: ORG,
      customer: "cus_Riverside",
      subscription: "sub_Riverside",
      plan: "suite",
      status: "active",
      apps: ["board"],
      periodEnd: new Date(1797811200 * 1000).toISOString(),
      cancelAtPeriodEnd: true,
    });
  });
  it("customer.subscription.deleted: canceled, found by subscription id", () => {
    const a = eventToAction(subDeleted as StripeEvent, MAP);
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
    expect(eventToAction(invoiceFailed as StripeEvent, MAP)).toEqual({
      kind: "status",
      subscription: "sub_Riverside",
      status: "past_due",
    });
    const old = {
      id: "evt_old",
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_Old" } },
    };
    expect(eventToAction(old, MAP)).toEqual({
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
    expect(eventToAction(payment, MAP).kind).toBe("ignore");
    expect(
      eventToAction({ id: "e", type: "charge.refunded", data: { object: {} } }, MAP).kind,
    ).toBe("ignore");
  });
  it("rejects org ids that aren't UUIDs", () => {
    const evt = structuredClone(checkoutDone) as StripeEvent;
    evt.data.object["client_reference_id"] = "'; drop table";
    (evt.data.object["metadata"] as Record<string, string>)["org_id"] = "nope";
    expect(eventToAction(evt, MAP)).toMatchObject({ org: null });
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
