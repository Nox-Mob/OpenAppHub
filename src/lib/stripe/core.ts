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

export type PriceMap = Partial<Record<PlanKey, Partial<Record<Interval, string>>>>;

/** STRIPE_PRICE_MAP (docs/SECRETS.md): {"starter":{"month":"price_…","year":"price_…"},…}. */
export function parsePriceMap(raw: string | undefined | null): PriceMap | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const map: PriceMap = {};
  for (const plan of PLAN_KEYS) {
    const entry = (data as Record<string, unknown>)[plan];
    if (!entry || typeof entry !== "object") continue;
    for (const interval of ["month", "year"] as const) {
      const price = (entry as Record<string, unknown>)[interval];
      if (typeof price === "string" && /^price_[A-Za-z0-9]+$/.test(price)) {
        (map[plan] ??= {})[interval] = price;
      }
    }
  }
  return Object.keys(map).length ? map : null;
}

export function priceFor(map: PriceMap, plan: PlanKey, interval: Interval): string | null {
  return map[plan]?.[interval] ?? null;
}

export function planForPrice(
  map: PriceMap,
  price: string | null | undefined,
): { plan: PlanKey; interval: Interval } | null {
  if (!price) return null;
  for (const plan of PLAN_KEYS) {
    for (const interval of ["month", "year"] as const) {
      if (map[plan]?.[interval] === price) return { plan, interval };
    }
  }
  return null;
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

function subscriptionAction(s: Record<string, unknown>, map: PriceMap | null): BillingAction {
  const id = str(s["id"]);
  if (!id) return { kind: "ignore", reason: "subscription without id" };
  const m = meta(s);
  const items = (s["items"] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const first = items[0] ?? {};
  const price = idOf(first["price"]);
  const fromPrice = map ? planForPrice(map, price) : null;
  // current_period_end moved from the subscription to its items in newer API versions.
  const periodEnd =
    isoFromUnix(s["current_period_end"]) ?? isoFromUnix(first["current_period_end"]);
  return {
    kind: "subscription",
    org: org(m["org_id"]),
    customer: idOf(s["customer"]),
    subscription: id,
    plan: fromPrice?.plan ?? plan(m["plan"]),
    status: mapStatus(s["status"]),
    apps: parseApps(m["apps"]),
    periodEnd,
    cancelAtPeriodEnd: s["cancel_at_period_end"] === true || typeof s["cancel_at"] === "number",
  };
}

/** What a webhook event means for billing.subscriptions. */
export function eventToAction(event: StripeEvent, map: PriceMap | null): BillingAction {
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
        apps: parseApps(m["apps"]),
        periodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return subscriptionAction(o, map);
    case "customer.subscription.deleted": {
      const a = subscriptionAction(o, map);
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
