// Checkout, Customer Portal and webhook handling (SHARED-SPEC §6.2), with the
// clients passed in so it can be tested. The hub's server functions
// (./billing.ts) and the webhook route call these.
//
// Service role (§7.2): only to read and save the organization's Stripe
// customer and to write what Stripe reports. Who may pay is checked as the
// signed-in user first (owner or admin of the organization).
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeGet, stripePost, StripeError } from "./stripe/api";
import {
  eventToAction,
  LOOKUP_KEYS,
  toPlanPrices,
  verifyStripeSignature,
  type PlanPrices,
  type Interval,
  type PlanKey,
  type StripeEvent,
  type SuiteAppId,
} from "./stripe/core";

export class BillingError extends Error {}

export type StripeConfig = {
  secret: string | null;
  webhookSecret: string | null;
};

// Prices come from Stripe by lookup key (core.ts), cached for a few minutes per
// Worker instance so the landing page doesn't call Stripe on every visit.
const PRICE_TTL_MS = 5 * 60 * 1000;
let priceCache: { secret: string; at: number; prices: PlanPrices } | null = null;

export function clearPriceCache() {
  priceCache = null;
}

/** Active prices with our lookup keys; {} when Stripe isn't set up or can't be reached. */
export async function fetchPlanPrices(opts: {
  secret: string | null;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<PlanPrices> {
  if (!opts.secret) return {};
  const now = opts.now ?? Date.now();
  if (priceCache && priceCache.secret === opts.secret && now - priceCache.at < PRICE_TTL_MS) {
    return priceCache.prices;
  }
  try {
    const list = await stripeGet<{ data?: unknown }>(
      opts.secret,
      "/prices",
      { active: true, limit: 100, lookup_keys: [...LOOKUP_KEYS] },
      opts.fetchImpl,
    );
    const prices = toPlanPrices(list.data);
    priceCache = { secret: opts.secret, at: now, prices };
    return prices;
  } catch (e) {
    if (e instanceof StripeError) console.error("stripe prices failed:", e.status, e.code ?? "");
    else console.error("stripe prices failed");
    return priceCache?.secret === opts.secret ? priceCache.prices : {};
  }
}

const NOT_SET_UP =
  "Payments aren't set up on this site yet. Your trial and your data are unaffected.";

async function requireManager(userClient: SupabaseClient, orgId: string) {
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) throw new BillingError("You need to be signed in.");
  const { data: ok, error } = await userClient.rpc("has_role", {
    p_org: orgId,
    p_roles: ["owner", "admin"],
  });
  if (error || ok !== true) {
    throw new BillingError("Only the owner or an admin can manage billing.");
  }
  // A chapter's organization is covered by its parent's plan (core 0006, billing 0004).
  const { data: parent } = await userClient.rpc("billing_parent_org", { p_org: orgId });
  const p = (Array.isArray(parent) ? parent[0] : parent) as { name?: string } | null | undefined;
  if (p?.name) {
    throw new BillingError(
      `This chapter is covered by ${p.name}'s plan. Its billing is managed there.`,
    );
  }
  return auth.user;
}

async function customerFor(opts: {
  service: SupabaseClient;
  secret: string;
  orgId: string;
  orgName: string;
  email: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const { data: existing, error } = await opts.service.rpc("billing_customer_for_org", {
    p_org: opts.orgId,
  });
  if (error) throw new BillingError("Billing isn't available right now. Try again in a minute.");
  if (typeof existing === "string" && existing) return existing;
  const customer = await stripePost<{ id: string }>(
    opts.secret,
    "/customers",
    { name: opts.orgName, email: opts.email, metadata: { org_id: opts.orgId } },
    opts.fetchImpl,
  );
  const { error: saveError } = await opts.service.rpc("billing_set_customer", {
    p_org: opts.orgId,
    p_customer: customer.id,
  });
  if (saveError)
    throw new BillingError("Billing isn't available right now. Try again in a minute.");
  return customer.id;
}

export async function createCheckout(opts: {
  userClient: SupabaseClient;
  service: SupabaseClient | null;
  config: StripeConfig;
  orgId: string;
  plan: PlanKey;
  interval: Interval;
  app?: SuiteAppId | undefined;
  origin: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string }> {
  const user = await requireManager(opts.userClient, opts.orgId);
  if (!opts.config.secret || !opts.service) throw new BillingError(NOT_SET_UP);
  if (opts.plan === "starter" && !opts.app) {
    throw new BillingError("Choose the app you want with Starter.");
  }

  // Already paying: plan changes go through the Customer Portal, so an
  // organization never ends up with two subscriptions.
  const { data: current } = await opts.userClient.rpc("get_org_billing", { p_org: opts.orgId });
  const row = (Array.isArray(current) ? current[0] : current) as { status?: string } | undefined;
  if (row?.status === "active" || row?.status === "past_due") {
    throw new BillingError("You already have a plan. Use Manage billing to change it.");
  }

  const prices = await fetchPlanPrices({
    secret: opts.config.secret,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const price = prices[opts.plan]?.[opts.interval]?.id;
  if (!price)
    throw new BillingError("That plan isn't available yet. Try another, or check back soon.");

  const { data: orgRow } = await opts.userClient
    .from("organizations")
    .select("name")
    .eq("id", opts.orgId)
    .maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? "Organization";
  const apps = opts.plan === "starter" ? opts.app! : "charter,board,ledger";
  const base = opts.origin.replace(/\/$/, "");
  try {
    const customer = await customerFor({
      service: opts.service,
      secret: opts.config.secret,
      orgId: opts.orgId,
      orgName,
      email: user.email,
      fetchImpl: opts.fetchImpl,
    });
    const metadata = { org_id: opts.orgId, plan: opts.plan, apps };
    const session = await stripePost<{ url: string }>(
      opts.config.secret,
      "/checkout/sessions",
      {
        mode: "subscription",
        customer,
        client_reference_id: opts.orgId,
        line_items: [{ price, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${base}/billing?checkout=done`,
        cancel_url: `${base}/billing?checkout=cancelled`,
      },
      opts.fetchImpl,
    );
    return { url: session.url };
  } catch (e) {
    if (e instanceof StripeError) {
      console.error("stripe checkout failed:", e.status, e.code ?? "");
      throw new BillingError("Stripe couldn't start the checkout. Try again in a minute.");
    }
    throw e;
  }
}

export async function createPortal(opts: {
  userClient: SupabaseClient;
  service: SupabaseClient | null;
  config: StripeConfig;
  orgId: string;
  origin: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string }> {
  await requireManager(opts.userClient, opts.orgId);
  if (!opts.config.secret || !opts.service) throw new BillingError(NOT_SET_UP);
  const { data: customer } = await opts.service.rpc("billing_customer_for_org", {
    p_org: opts.orgId,
  });
  if (typeof customer !== "string" || !customer) {
    throw new BillingError("There's no billing account yet. Choose a plan first.");
  }
  try {
    const session = await stripePost<{ url: string }>(
      opts.config.secret,
      "/billing_portal/sessions",
      { customer, return_url: `${opts.origin.replace(/\/$/, "")}/billing` },
      opts.fetchImpl,
    );
    return { url: session.url };
  } catch (e) {
    if (e instanceof StripeError) {
      console.error("stripe portal failed:", e.status, e.code ?? "");
      throw new BillingError("Stripe couldn't open billing. Try again in a minute.");
    }
    throw e;
  }
}

/**
 * The webhook: verify, skip events already seen, apply, and forget the event if
 * applying fails so Stripe's retry runs it again. Returns an HTTP status.
 */
export async function handleWebhook(opts: {
  payload: string;
  signature: string | null;
  service: SupabaseClient | null;
  config: StripeConfig;
  now?: number;
}): Promise<{ status: number; body: string }> {
  if (!opts.config.webhookSecret || !opts.service) {
    return { status: 503, body: "billing not configured" };
  }
  const valid = await verifyStripeSignature({
    payload: opts.payload,
    header: opts.signature,
    secret: opts.config.webhookSecret,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });
  if (!valid) return { status: 400, body: "invalid signature" };

  let event: StripeEvent;
  try {
    event = JSON.parse(opts.payload) as StripeEvent;
  } catch {
    return { status: 400, body: "invalid payload" };
  }
  if (typeof event?.id !== "string" || typeof event?.type !== "string") {
    return { status: 400, body: "invalid event" };
  }

  const { data: isNew, error: recordError } = await opts.service.rpc("billing_record_event", {
    p_id: event.id,
    p_type: event.type,
  });
  if (recordError) {
    console.error("stripe webhook: could not record", event.id, event.type);
    return { status: 500, body: "try again" };
  }
  if (isNew === false) return { status: 200, body: "duplicate" };

  const action = eventToAction(event);
  try {
    if (action.kind === "subscription") {
      const { error } = await opts.service.rpc("billing_apply_subscription", {
        p_org: action.org,
        p_customer: action.customer,
        p_subscription: action.subscription,
        p_plan: action.plan,
        p_status: action.status,
        p_apps: action.apps,
        p_period_end: action.periodEnd,
        p_cancel_at_period_end: action.cancelAtPeriodEnd,
      });
      if (error) throw new Error(error.message);
    } else if (action.kind === "status") {
      const { error } = await opts.service.rpc("billing_set_status", {
        p_subscription: action.subscription,
        p_status: action.status,
      });
      if (error) throw new Error(error.message);
    }
  } catch {
    console.error("stripe webhook: failed to apply", event.id, event.type);
    await opts.service.rpc("billing_forget_event", { p_id: event.id });
    return { status: 500, body: "try again" };
  }
  console.log("stripe webhook:", event.id, event.type, action.kind);
  return { status: 200, body: "ok" };
}

export function stripeConfigFromEnv(env: Record<string, string | undefined>): StripeConfig {
  return {
    secret: env["STRIPE_SECRET_KEY"] || null,
    webhookSecret: env["STRIPE_WEBHOOK_SECRET"] || null,
  };
}
