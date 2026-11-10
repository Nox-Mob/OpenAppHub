// Suite billing with Stripe (SHARED-SPEC §6.2): the pure parts, tested with
// fixture payloads. No Stripe SDK: the Worker calls Stripe's REST API with
// fetch (./api.ts) and verifies webhook signatures with Web Crypto.
//
// Never log a Stripe object or a secret: log the event id and type only.

export type PlanKey = "starter" | "suite" | "plus";
export type Interval = "month" | "year";
export type SuiteAppId = "charter" | "board" | "ledger";
export const PLAN_KEYS: readonly PlanKey[] = ["starter", "suite", "plus"];
export const SUITE_APP_IDS: readonly SuiteAppId[] = ["charter", "board", "ledger"];

// Prices live in Stripe, found by lookup key "<plan>_<interval>" (for example
// "suite_year"), so the owner changes prices in Stripe without touching code.

export type PlanPrice = { id: string; cents: number | null; currency: string };
export type PlanPrices = Partial<Record<PlanKey, Partial<Record<Interval, PlanPrice>>>>;
/** Display amounts only (no price ids), safe to send to any browser. */
export type PlanAmounts = Partial<Record<PlanKey, Partial<Record<Interval, number>>>>;

export const lookupKey = (plan: PlanKey, interval: Interval) => `${plan}_${interval}`;
export const LOOKUP_KEYS: readonly string[] = PLAN_KEYS.flatMap((p) =>
  (["month", "year"] as const).map((i) => lookupKey(p, i)),
);

export function planFromLookupKey(key: unknown): { plan: PlanKey; interval: Interval } | null {
  if (typeof key !== "string") return null;
  const m = /^(starter|suite|plus)_(month|year)$/.exec(key);
  return m ? { plan: m[1] as PlanKey, interval: m[2] as Interval } : null;
}

/** Stripe's price list (active prices with our lookup keys) → plan prices. */
export function toPlanPrices(list: unknown): PlanPrices {
  const out: PlanPrices = {};
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const key = planFromLookupKey(p["lookup_key"]);
    const recurring = p["recurring"] as { interval?: unknown } | null | undefined;
    if (!key || p["active"] === false || typeof p["id"] !== "string") continue;
    if (recurring?.interval !== key.interval) continue; // a "suite_year" key on a monthly price
    (out[key.plan] ??= {})[key.interval] ??= {
      id: p["id"],
      cents: typeof p["unit_amount"] === "number" ? p["unit_amount"] : null,
      currency: typeof p["currency"] === "string" ? p["currency"] : "usd",
    };
  }
  return out;
}

export function planAmounts(prices: PlanPrices): PlanAmounts {
  const out: PlanAmounts = {};
  for (const plan of PLAN_KEYS) {
    for (const interval of ["month", "year"] as const) {
      const cents = prices[plan]?.[interval]?.cents;
      if (typeof cents === "number") (out[plan] ??= {})[interval] = cents;
    }
  }
  return out;
}

/**
 * Apps a plan gives. Suite and Plus give every app, whatever the subscription's
 * metadata says, so a plan change made in Stripe can't leave the wrong apps.
 * Starter gives the one app chosen at checkout (the first, if several were saved).
 */
export function appsForPlan(plan: PlanKey | null, fromMetadata: SuiteAppId[]): SuiteAppId[] {
  if (plan === "suite" || plan === "plus") return [...SUITE_APP_IDS];
  if (plan === "starter") return fromMetadata.slice(0, 1);
  return fromMetadata;
}

// Webhook signatures -----------------------------------------------------------
// Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">.

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(opts: {
  payload: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): Promise<boolean> {
  if (!opts.header || !opts.secret) return false;
  const parts = opts.header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = await hmacHex(opts.secret, `${t}.${opts.payload}`);
  return signatures.some((s) => timingSafeEqual(s, expected));
}

/** For tests and local tools: the header Stripe would send for this payload. */
export async function signStripePayload(payload: string, secret: string, t: number) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}

// Events → database writes -----------------------------------------------------------

export type BillingStatus =
  "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "expired";

export type BillingAction =
  | {
      kind: "subscription";
      org: string | null;
      customer: string | null;
      subscription: string;
      plan: PlanKey | null;
      status: BillingStatus;
      apps: SuiteAppId[];
      periodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    }
  | { kind: "status"; subscription: string; status: BillingStatus }
  | { kind: "ignore"; reason: string };

export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stripe subscription status → ours. */
export function mapStatus(status: unknown): BillingStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
      return status;
    case "incomplete_expired":
      return "expired";
    case "paused":
      return "unpaid";
    default:
      return "incomplete";
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const idOf = (v: unknown): string | null =>
  str(v) ?? (v && typeof v === "object" ? str((v as { id?: unknown }).id) : null);
const meta = (o: Record<string, unknown>): Record<string, unknown> =>
  o["metadata"] && typeof o["metadata"] === "object"
    ? (o["metadata"] as Record<string, unknown>)
    : {};

export function parseApps(value: unknown): SuiteAppId[] {
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((a) => a.trim())
        .filter((a): a is SuiteAppId => (SUITE_APP_IDS as readonly string[]).includes(a)),
    ),
  ];
}

const plan = (v: unknown): PlanKey | null =>
  (PLAN_KEYS as readonly unknown[]).includes(v) ? (v as PlanKey) : null;
const org = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v : null);
const isoFromUnix = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;

function subscriptionAction(s: Record<string, unknown>): BillingAction {
  const id = str(s["id"]);
  if (!id) return { kind: "ignore", reason: "subscription without id" };
  const m = meta(s);
  const items = (s["items"] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const first = items[0] ?? {};
  const price = first["price"] as { lookup_key?: unknown } | undefined;
  const fromPrice = planFromLookupKey(price?.lookup_key);
  // current_period_end moved from the subscription to its items in newer API versions.
  const periodEnd =
    isoFromUnix(s["current_period_end"]) ?? isoFromUnix(first["current_period_end"]);
  const subPlan = fromPrice?.plan ?? plan(m["plan"]);
  return {
    kind: "subscription",
    org: org(m["org_id"]),
    customer: idOf(s["customer"]),
    subscription: id,
    plan: subPlan,
    status: mapStatus(s["status"]),
    apps: appsForPlan(subPlan, parseApps(m["apps"])),
    periodEnd,
    cancelAtPeriodEnd: s["cancel_at_period_end"] === true || typeof s["cancel_at"] === "number",
  };
}

/** What a webhook event means for billing.subscriptions. */
export function eventToAction(event: StripeEvent): BillingAction {
  const o = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      if (o["mode"] !== "subscription") return { kind: "ignore", reason: "not a subscription" };
      const subscription = idOf(o["subscription"]);
      if (!subscription) return { kind: "ignore", reason: "no subscription" };
      const m = meta(o);
      return {
        kind: "subscription",
        org: org(o["client_reference_id"]) ?? org(m["org_id"]),
        customer: idOf(o["customer"]),
        subscription,
        plan: plan(m["plan"]),
        status: o["payment_status"] === "unpaid" ? "incomplete" : "active",
        apps: appsForPlan(plan(m["plan"]), parseApps(m["apps"])),
        periodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return subscriptionAction(o);
    case "customer.subscription.deleted": {
      const a = subscriptionAction(o);
      return a.kind === "subscription" ? { ...a, status: "canceled", cancelAtPeriodEnd: false } : a;
    }
    case "invoice.payment_failed": {
      const parent = o["parent"] as
        { subscription_details?: { subscription?: unknown } } | undefined;
      const subscription =
        idOf(o["subscription"]) ?? idOf(parent?.subscription_details?.subscription);
      return subscription
        ? { kind: "status", subscription, status: "past_due" }
        : { kind: "ignore", reason: "invoice without subscription" };
    }
    default:
      return { kind: "ignore", reason: `unhandled ${event.type}` };
  }
}

/** Form-encodes nested params the way Stripe's API expects (a[b][0]=c). */
export function formEncode(params: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object")
          out.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.filter(Boolean).join("&");
}
