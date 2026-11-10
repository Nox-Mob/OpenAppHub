// Plans shown on the landing and billing pages. Prices are NOT here: they come
// from Stripe by lookup key ("<plan>_<interval>", src/lib/stripe/core.ts), so the
// owner changes them in Stripe. Without Stripe (or a missing price) a plan shows
// "Price TBA". Limits mirror billing.plans (editors, 0003_editor_limits.sql); the
// database is what enforces them.

export type PlanId = "starter" | "suite" | "plus";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "One app for a small team",
    features: ["Choose 1 app: Charter, Board or Ledger", "Up to 5 editors", "Export at any time"],
  },
  {
    id: "suite",
    name: "Suite",
    tagline: "Every app, one organization",
    features: [
      "All three apps",
      "Up to 15 editors",
      "One sign-in across the apps",
      "Export at any time",
    ],
    highlighted: true,
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "For larger organizations",
    features: [
      "All three apps",
      "Unlimited editors",
      "One sign-in across the apps",
      "Export at any time",
    ],
  },
];

export const TRIAL = {
  days: 30,
  summary: "30-day free trial of every app. No card needed.",
};

export const PRICE_TBA = "Price TBA";

/** Editors on the trial (billing.trial_member_limit). */
export const TRIAL_EDITORS = 10;

/** Who counts toward a plan's limit, in plain words. */
export const EDITORS_NOTE =
  "Editors are everyone who can change your data: owners, admins and members. Viewers, and dues-paying members in OpenCharterApp, don't count toward the limit.";
