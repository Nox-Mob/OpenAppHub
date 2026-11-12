import type { ScreenProps } from "./types";
import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "@shared/format";
import { daysLeft, hasAppAccess, type OrgBilling } from "@shared/supabase/billing";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { HelpLink } from "@shared/ui/HelpLink";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { APPS } from "@/config/apps";
import { HELP } from "@/config/help";
import {
  EDITORS_NOTE,
  PLANS,
  PRICE_TBA,
  TRIAL_EDITORS,
  type Plan,
  type PlanId,
} from "@/config/pricing";
import type { openBillingPortal, startCheckout } from "@/lib/billing";
import { canManage } from "@/lib/roles";
import type { PlanAmounts } from "@/lib/stripe/core";
import { useAsync } from "@/lib/use-async";

// Suite billing (AGENTS step 20, SHARED-SPEC §6.2). The database decides access
// (get_org_billing); this page explains it and starts Stripe Checkout or the
// Customer Portal. Prices come from Stripe by lookup key (billingConfigured).

type Interval = "month" | "year";
type AppChoice = "charter" | "board" | "ledger";

const STATUS_LABEL: Record<OrgBilling["status"], string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due",
  canceled: "Ended",
  unpaid: "Unpaid",
  incomplete: "Not finished",
  expired: "Trial ended",
};

const appName = (id: string) => APPS.find((a) => a.id === id)?.name ?? id;

export type BillingActions = {
  checkout: typeof startCheckout;
  portal: typeof openBillingPortal;
};

export function BillingScreen({
  hub,
  checkoutConfigured,
  checkoutResult,
  actions,
  prices = {},
}: ScreenProps & {
  checkoutConfigured: boolean;
  prices?: PlanAmounts;
  checkoutResult?: "done" | "cancelled" | undefined;
  actions: BillingActions;
}) {
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  if (!org) return <NoOrganization />;
  const b = hub.billing;
  const manager = canManage(hub.role);
  const paying = b?.status === "active" || b?.status === "past_due";
  const hasCustomer = !!b && b.status !== "trialing" && b.status !== "expired";

  return (
    <>
      <PageHeader
        title="Billing"
        description={`${org.name}'s plan`}
        actions={<HelpLink path={HELP.billing}>Plans and billing</HelpLink>}
      />
      <div className="max-w-3xl space-y-6">
        {checkoutResult === "done" ? (
          <Alert role="status">
            Thank you. Your plan is being set up: this page shows it within a minute. You'll get a
            receipt by email.
          </Alert>
        ) : checkoutResult === "cancelled" ? (
          <Alert role="status">Checkout was cancelled. Nothing was charged.</Alert>
        ) : null}

        {org.parent ? (
          <Panel
            title={`Covered by ${org.parent.name}`}
            description="This chapter's organization uses its national's plan."
          >
            <p className="text-sm text-muted-foreground">
              {org.name} doesn't have a plan or a bill of its own. If {org.parent.name}'s plan ends,
              this chapter's board becomes read-only too.
            </p>
          </Panel>
        ) : !b ? (
          <Panel title="Billing is off" description="Every app is available without a plan here.">
            <p className="text-sm text-muted-foreground">
              This server doesn't use OpenAppHub plans (for example, it's self-hosted).
            </p>
          </Panel>
        ) : (
          <CurrentPlan
            billing={b}
            orgId={org.id}
            manager={manager}
            timeZone={hub.prefs.timeZone}
            portal={hasCustomer && manager ? actions.portal : null}
          />
        )}

        {b && !paying && !org.parent ? (
          manager ? (
            <PlanPicker
              orgId={org.id}
              configured={checkoutConfigured}
              checkout={actions.checkout}
              prices={prices}
            />
          ) : (
            <Panel title="Choose a plan">
              <p className="text-sm text-muted-foreground">
                Ask an owner or admin of {org.name} to choose a plan.
              </p>
            </Panel>
          )
        ) : null}

        <Panel title="If a plan ends" description="Your data stays yours.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Nothing is deleted.</strong> The apps become
              read-only until you choose a plan again.
            </li>
            <li>You can still see everything, and owners and admins can export it at any time.</li>
            <li>Charter still records dues payments members already made.</li>
          </ul>
          <HelpLink path={HELP.export} className="mt-3">
            Your data and exports
          </HelpLink>
        </Panel>
      </div>
    </>
  );
}

function CurrentPlan({
  billing: b,
  orgId,
  manager,
  timeZone,
  portal,
}: {
  billing: OrgBilling;
  orgId: string;
  manager: boolean;
  timeZone: string;
  portal: typeof openBillingPortal | null;
}) {
  const supabase = getSupabaseBrowserClient();
  const plans = useAsync(async () => {
    if (!supabase) return [];
    const { data } = await supabase.rpc("billing_plans");
    return (data ?? []) as { id: string; name: string; max_members: number | null }[];
  }, [supabase]);
  const members = useAsync(async () => {
    if (!supabase || !manager) return null;
    const { data } = await supabase.rpc("billing_member_count", { p_org: orgId });
    return typeof data === "number" ? data : null;
  }, [supabase, orgId, manager]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const plan = b.plan_id ? plans.data?.find((p) => p.id === b.plan_id) : null;
  const paying = b.status === "active" || b.status === "past_due";
  const limit = paying ? (plan ? plan.max_members : undefined) : TRIAL_EDITORS;
  const days = daysLeft(b.trial_ends_at);
  const date = (d: string | null) => (d ? formatDate(d, { timeZone }) : "");
  const readOnly = !(["charter", "board", "ledger"] as const).some((a) => hasAppAccess(b, a));

  async function manage() {
    if (!portal) return;
    setBusy(true);
    setError("");
    const res = await portal({ data: { orgId } });
    if ("error" in res) {
      setBusy(false);
      return setError(res.error);
    }
    window.location.assign(res.url);
  }

  const tone =
    b.status === "active" || (b.status === "trialing" && !readOnly)
      ? "bg-success/12 text-success"
      : b.status === "past_due" || b.status === "trialing"
        ? "bg-warning/20 text-foreground"
        : "bg-destructive/12 text-destructive";

  return (
    <Panel title="Your plan">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-lg font-semibold">
          {b.status === "trialing" || b.status === "expired"
            ? "Free trial"
            : (plan?.name ?? b.plan_id ?? "Plan")}
        </p>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${tone}`}
          data-testid="plan-status"
        >
          {STATUS_LABEL[b.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="plan-summary">
        {b.status === "trialing" && !readOnly
          ? `Every app, up to ${TRIAL_EDITORS} editors. ${days === 0 ? "Ends today" : `${days} ${days === 1 ? "day" : "days"} left`}, until ${date(b.trial_ends_at)}. No card needed.`
          : b.status === "active" && b.cancel_at_period_end
            ? `Cancelled: it ends on ${date(b.current_period_end)}. After that, the apps become read-only.`
            : b.status === "active"
              ? `Renews on ${date(b.current_period_end)}.`
              : b.status === "past_due"
                ? "We couldn't take the last payment. Update your payment details to keep full access."
                : "The apps are read-only. Everything is still here and can be exported. Choose a plan to keep working."}
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Apps</dt>
          <dd className="font-medium">
            {readOnly
              ? "Read-only"
              : b.status === "trialing"
                ? "All three"
                : b.apps.map(appName).join(", ") || "None"}
          </dd>
        </div>
        {manager ? (
          <div>
            <dt className="text-muted-foreground">Editors</dt>
            <dd className="font-medium" data-testid="member-usage">
              {members.data ?? "…"}
              {limit === null ? " (no limit)" : limit !== undefined ? ` of ${limit}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      {portal ? (
        <div className="mt-4">
          <Button
            variant={b.status === "past_due" ? "default" : "outline"}
            disabled={busy}
            onClick={() => void manage()}
          >
            {busy ? "Opening…" : b.status === "past_due" ? "Update payment" : "Manage billing"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Change plan, payment method or billing details, see invoices, or cancel, on Stripe.
          </p>
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </Panel>
  );
}

// Suite prices are in US dollars (from Stripe), whatever the organization's currency.
function price(plan: Plan, interval: Interval, prices: PlanAmounts): string {
  const cents = prices[plan.id]?.[interval];
  if (cents === undefined) return PRICE_TBA;
  return `${formatMoney(cents, { currency: "USD" })} / ${interval}`;
}

function PlanPicker({
  orgId,
  configured,
  checkout,
  prices,
}: {
  orgId: string;
  configured: boolean;
  checkout: typeof startCheckout;
  prices: PlanAmounts;
}) {
  const [interval, setInterval] = useState<Interval>("month");
  const [app, setApp] = useState<AppChoice | "">("");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState("");

  async function choose(plan: PlanId) {
    setError("");
    if (plan === "starter" && !app) return setError("Choose the app you want with Starter.");
    setBusy(plan);
    const res = await checkout({
      data: { orgId, plan, interval, ...(plan === "starter" && app ? { app } : {}) },
    });
    if ("error" in res) {
      setBusy(null);
      return setError(res.error);
    }
    window.location.assign(res.url);
  }

  return (
    <Panel
      title="Choose a plan"
      description="One price per organization, in US dollars. Choose before the trial ends to keep every app writable."
    >
      <div
        className="mb-4 inline-flex rounded-md border p-0.5"
        role="group"
        aria-label="Billing period"
      >
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={interval === i}
            onClick={() => setInterval(i)}
            className={`rounded-sm px-3 py-1.5 text-sm font-medium ${interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {i === "month" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <li
            key={p.id}
            data-plan={p.id}
            className={`flex flex-col rounded-lg border p-4 ${p.highlighted ? "border-primary" : ""}`}
          >
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <p className="mt-3 text-lg font-semibold">{price(p, interval, prices)}</p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {p.id === "starter" ? (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="starter-app">App</Label>
                <Select
                  id="starter-app"
                  value={app}
                  onChange={(e) => setApp(e.target.value as AppChoice | "")}
                >
                  <option value="">Choose an app…</option>
                  {APPS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Button
              className="mt-4"
              variant={p.highlighted ? "default" : "outline"}
              disabled={!configured || prices[p.id]?.[interval] === undefined || busy !== null}
              onClick={() => void choose(p.id)}
            >
              {busy === p.id ? "Opening checkout…" : `Choose ${p.name}`}
            </Button>
          </li>
        ))}
      </ul>
      {!configured ? (
        <Alert className="mt-4">
          Plans open when prices are announced. Nothing is charged until you choose one.
        </Alert>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {EDITORS_NOTE} Payment is handled by Stripe. You can cancel at any time from Manage
          billing.
        </p>
      )}
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </Panel>
  );
}

/** After checkout, re-read the plan a few times while Stripe's webhook lands. */
export function useRefreshAfterCheckout(active: boolean, refresh: () => void) {
  useEffect(() => {
    if (!active) return;
    const ids = [3000, 8000, 20000].map((ms) => setTimeout(refresh, ms));
    return () => ids.forEach(clearTimeout);
  }, [active, refresh]);
}
