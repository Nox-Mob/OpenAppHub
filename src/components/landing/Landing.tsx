// The public landing page (AGENTS step 21): the three apps and what they do,
import { AppLogo } from "@shared/ui/AppLogo";
// how the suite works, plans (prices from Stripe by lookup key, "Price TBA" when
// there's none), self-hosting, FAQ.
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Download,
  KeyRound,
  LockKeyhole,
  Server,
  Building2,
} from "lucide-react";
import type { ReactNode } from "react";
import { docsUrl } from "@shared/docs";
import { formatMoney } from "@shared/format";
import { Button } from "@/components/ui/button";
import { APPS, type AppInfo } from "@/config/apps";
import { EDITORS_NOTE, PLANS, PRICE_TBA, TRIAL, type Plan } from "@/config/pricing";
import type { PlanAmounts } from "@/lib/stripe/core";
import { cn } from "@/lib/utils";
import { signupsOpen } from "@/components/site";
import { BoardPreview, CharterPreview, LedgerPreview, PREVIEWS } from "./previews";

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 py-16 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          {intro ? (
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">{intro}</p>
          ) : null}
        </div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}

function PrimaryCta({ size = "lg" }: { size?: "lg" | "default" }) {
  return signupsOpen() ? (
    <Button asChild size={size}>
      <Link to="/signup">
        Start your free trial <ArrowRight />
      </Link>
    </Button>
  ) : (
    <Button asChild size={size}>
      <Link to="/login">
        Sign in <ArrowRight />
      </Link>
    </Button>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <span className="flex gap-1" aria-hidden="true">
              <span data-app="charter" className="size-1.5 rounded-full bg-app-accent" />
              <span data-app="board" className="size-1.5 rounded-full bg-app-accent" />
              <span data-app="ledger" className="size-1.5 rounded-full bg-app-accent" />
            </span>
            Open source · for associations, boards and nonprofits
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Run your members, meetings and money in one place
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
            OpenAppHub brings together three apps built for volunteer-led organizations: members and
            dues, board meetings and minutes, and the books. One account, one organization, every
            app.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta />
            <Button asChild size="lg" variant="outline">
              <a href="#apps">See the apps</a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {signupsOpen()
              ? TRIAL.summary
              : "New accounts open soon. The apps are open source and free to self-host today."}
          </p>
        </div>
        <div
          className="relative mx-auto w-full max-w-lg lg:max-w-none"
          aria-label="Preview of the three apps"
        >
          <LedgerPreview className="relative z-10 w-full sm:w-[88%]" />
          <CharterPreview className="relative z-20 -mt-32 ml-auto hidden w-[80%] sm:block" />
          <BoardPreview className="relative z-30 -mt-16 hidden w-[72%] sm:block sm:-mt-24" />
        </div>
      </div>
    </section>
  );
}

const PILLARS = [
  {
    icon: KeyRound,
    title: "One sign-in",
    text: "Sign in once and move between the apps without signing in again.",
  },
  {
    icon: Building2,
    title: "One organization",
    text: "Your organization, members and roles are shared by every app. Set them up once.",
  },
  {
    icon: Download,
    title: "Your data stays yours",
    text: "Export everything, any time, even if your plan lapses. The code is open source.",
  },
  {
    icon: LockKeyhole,
    title: "Separate and secure",
    text: "Every organization's records are isolated in the database, and changes are audited.",
  },
];

function Pillars() {
  return (
    <section className="border-b bg-sidebar">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppBlock({ app, flip }: { app: AppInfo; flip: boolean }) {
  const Preview = PREVIEWS[app.id];
  return (
    <article
      id={app.id}
      data-app={app.id}
      className="grid scroll-mt-20 items-center gap-10 border-t py-14 first:border-t-0 first:pt-0 lg:grid-cols-2 lg:gap-16"
    >
      <div className={cn("min-w-0", flip && "lg:order-2")}>
        <p className="inline-flex items-center gap-2 text-sm font-semibold">
          <AppLogo app={app.id} size={24} />
          {app.name}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{app.tagline}</h3>
        <p className="mt-3 text-muted-foreground">{app.description}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {app.features.map((f) => (
            <li key={f.title} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-app-accent" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">{f.title}</span>
                <span className="block text-sm text-muted-foreground">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Not yet:</span> {app.limits}
        </p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
          <a
            className="inline-flex items-center gap-1 hover:underline underline-offset-4"
            href={docsUrl(app.docsPath)}
          >
            Read the {app.short} docs <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
          <a
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
            href={app.repo}
          >
            Source code
          </a>
        </div>
      </div>
      <div className={cn("mx-auto w-full min-w-0 max-w-lg", flip && "lg:order-1")}>
        <Preview />
      </div>
    </article>
  );
}

const STEPS = [
  { title: "Create your account", text: "One account for every app, with email or Google." },
  {
    title: "Set up your organization",
    text: "Name it and invite the people who run it. Roles carry across the apps.",
  },
  {
    title: "Use the apps you need",
    text: `Every app is included in the ${TRIAL.days}-day trial. Keep the ones that fit.`,
  },
];

function HowItWorks() {
  return (
    <Section
      eyebrow="How it works"
      title="Up and running in minutes"
      className="border-t bg-sidebar"
    >
      <ol className="grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border bg-card p-6 shadow-sm">
            <span className="tnum grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function price(plan: Plan, prices: PlanAmounts) {
  const month = prices[plan.id]?.month;
  return month === undefined ? PRICE_TBA : `${formatMoney(month, { currency: "USD" })}/month`;
}

function yearly(plan: Plan, prices: PlanAmounts) {
  const year = prices[plan.id]?.year;
  return year === undefined ? null : `or ${formatMoney(year, { currency: "USD" })}/year`;
}

function Pricing({ prices }: { prices: PlanAmounts }) {
  const priced = Object.keys(prices).length > 0;
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple plans for each organization"
      intro={
        priced
          ? `${TRIAL.summary} One price per organization, in US dollars.`
          : `${TRIAL.summary} Prices will be announced before new accounts open.`
      }
    >
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-lg border bg-card p-6 shadow-sm",
              plan.highlighted && "border-primary shadow-md ring-1 ring-primary",
            )}
          >
            {plan.highlighted ? (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                Most popular
              </span>
            ) : null}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
            <p className="mt-5 text-2xl font-semibold tracking-tight">{price(plan, prices)}</p>
            {yearly(plan, prices) ? (
              <p className="text-sm text-muted-foreground">{yearly(plan, prices)}</p>
            ) : null}
            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {signupsOpen() ? (
                <Button
                  asChild
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  <Link to="/signup">Start free trial</Link>
                </Button>
              ) : (
                <Button className="w-full" variant="outline" disabled>
                  Coming soon
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        {EDITORS_NOTE} If a plan lapses, your data becomes read-only and you can still export
        everything.
      </p>
    </Section>
  );
}

function SelfHosting() {
  return (
    <Section
      id="self-hosting"
      eyebrow="Self-hosting"
      title="Prefer to run it yourself?"
      intro="Every app is open source and runs on its own, on your own database. Self-hosting is free; you look after updates and backups."
      className="border-t"
    >
      <div className="grid gap-6 md:grid-cols-3">
        {APPS.map((app) => (
          <div key={app.id} data-app={app.id} className="rounded-lg border bg-card p-6 shadow-sm">
            <Server className="size-5 text-app-accent" aria-hidden="true" />
            <h3 className="mt-3 text-base font-semibold">{app.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{app.tagline}</p>
            <div className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
              <a
                className="hover:underline underline-offset-4"
                href={docsUrl(`${app.docsPath}help/self-hosting/`)}
              >
                Self-hosting guide
              </a>
              <a
                className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                href={app.repo}
              >
                Source code on GitHub
              </a>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I have to use all three apps?",
    a: "No. The Starter plan includes one app of your choice, and you can add the others later. During the trial you can try all three.",
  },
  {
    q: "What happens when the trial ends?",
    a: "Nothing is deleted. Your organization becomes read-only until you choose a plan, and you can export your data at any time.",
  },
  {
    q: "Can I get my data out?",
    a: "Yes. Owners and admins can export everything from each app, whenever they like, including when the organization is read-only.",
  },
  {
    q: "Do our dues-paying members need a plan seat?",
    a: "No. In OpenCharterApp, members who join and pay dues get their own member access and don't count toward your plan's limit. Only the people who run the organization do.",
  },
  {
    q: "Who can see our records?",
    a: "Only people in your organization, with the roles you give them. Each organization's data is kept separate by the database itself, and important changes are logged.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. You can read the code, run each app on your own server, and leave the hosted service whenever you want, taking your data with you.",
  },
];

function Faq() {
  return (
    <Section eyebrow="Questions" title="Frequently asked questions" className="border-t bg-sidebar">
      <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group border-b py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Spend less time on admin.</h2>
          <p className="mt-2 text-muted-foreground">
            Members, meetings and money, handled in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrimaryCta />
          <Button asChild size="lg" variant="outline">
            <a href={docsUrl("hub/")}>Read the docs</a>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Landing({ prices = {} }: { prices?: PlanAmounts }) {
  return (
    <main>
      <Hero />
      <Pillars />
      <Section
        id="apps"
        eyebrow="The apps"
        title="Three apps, one organization"
        intro="Use one or all three. They share your account, your organization and your people."
      >
        {APPS.map((app, i) => (
          <AppBlock key={app.id} app={app} flip={i % 2 === 1} />
        ))}
      </Section>
      <HowItWorks />
      <Pricing prices={prices} />
      <SelfHosting />
      <Faq />
      <FinalCta />
    </main>
  );
}
