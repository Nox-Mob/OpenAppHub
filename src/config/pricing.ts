// Plans shown on the landing page. Prices are NOT confirmed (SHARED-SPEC §6.1):
// they stay null, shown as "Price TBA", until the owner sets them. This file and
// the draft docs plans page are the only places prices may ever appear.
// Limits mirror the placeholder billing.plans rows (§6.1); the database is what
// enforces them.

export type PlanId = "starter" | "suite" | "plus";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price per month in cents, or null while unconfirmed. */
  monthlyCents: number | null;
  /** Price per year in cents, or null while unconfirmed. */
  yearlyCents: number | null;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "One app for a small team",
    monthlyCents: null,
    yearlyCents: null,
    features: ["Choose 1 app: Charter, Board or Ledger", "Up to 10 members", "Export at any time"],
  },
  {
    id: "suite",
    name: "Suite",
    tagline: "Every app, one organization",
    monthlyCents: null,
    yearlyCents: null,
    features: [
      "All three apps",
      "Up to 25 members",
      "One sign-in across the apps",
      "Export at any time",
    ],
    highlighted: true,
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "For larger organizations",
    monthlyCents: null,
    yearlyCents: null,
    features: [
      "All three apps",
      "Unlimited members",
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
