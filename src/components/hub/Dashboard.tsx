// The dashboard's panels: key information from every app in one place (tasks, meetings, money,
// membership). Data from src/lib/dashboard.ts; a panel whose app isn't here says so and links to it.
import { useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { formatDate, formatMoney } from "@shared/format";
import { AppLogo } from "@shared/ui/AppLogo";
import {
  PANELS,
  completeTask,
  loadDashboard,
  thisWeek,
  type DashboardData,
  type DashboardTask,
  type PanelId,
  type SuiteApp,
  type Week,
} from "@/lib/dashboard";
import { useAsync } from "@/lib/use-async";

const APP_LABEL: Record<SuiteApp, string> = {
  charter: "OpenCharterApp",
  board: "OpenBoardApp",
  ledger: "OpenLedgerApp",
};

function Panel({
  title,
  app,
  action,
  children,
}: {
  title: string;
  app?: SuiteApp;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border bg-card p-5 shadow-sm"
      {...(app ? { "data-app": app } : {})}
      aria-label={title}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          {app ? <AppLogo app={app} size={18} /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  app,
}: {
  label: string;
  value: string;
  sub?: string;
  app?: SuiteApp;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm" {...(app ? { "data-app": app } : {})}>
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {app ? <AppLogo app={app} size={14} /> : null}
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

function NotHere({ app, href }: { app: SuiteApp; href: string | undefined }) {
  return (
    <Empty>
      Shows here once {APP_LABEL[app]} is in use.{" "}
      {href ? (
        <a className="underline" href={href}>
          Open {APP_LABEL[app]}
        </a>
      ) : null}
    </Empty>
  );
}

function MonthBars({
  data,
  currency,
}: {
  data: DashboardData["money"] & object;
  currency: string;
}) {
  const max = Math.max(1, ...data.months.flatMap((m) => [m.revenue_cents, m.expense_cents]));
  return (
    <div className="mt-4 flex h-24 items-end gap-1.5" aria-hidden="true">
      {data.months.map((m) => (
        <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-20 w-full items-end justify-center gap-0.5">
            <span
              className="w-1/2 rounded-sm bg-app-accent"
              style={{ height: `${(m.revenue_cents / max) * 100}%` }}
              title={`In ${formatMoney(m.revenue_cents, { currency })}`}
            />
            <span
              className="w-1/2 rounded-sm bg-muted-foreground/40"
              style={{ height: `${(m.expense_cents / max) * 100}%` }}
              title={`Out ${formatMoney(m.expense_cents, { currency })}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {new Date(`${m.month}T00:00:00Z`).toLocaleString("en-US", {
              month: "short",
              timeZone: "UTC",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Today in the organization's time zone, as yyyy-mm-dd. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  if (d.getTime() - t.getTime() === 86_400_000) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function WeekPanel({
  week,
  today,
  meetingHref,
}: {
  week: Week | null;
  today: string;
  meetingHref: (id: string) => string | undefined;
}) {
  return (
    <Panel title="This week">
      {!week ? (
        <Empty>Meetings and due dates from your apps show here.</Empty>
      ) : week.days.length === 0 && week.overdue.length === 0 ? (
        <Empty>Nothing scheduled or due in the next seven days.</Empty>
      ) : (
        <ol className="space-y-4">
          {week.overdue.length ? (
            <li>
              <p className="mb-1 text-xs font-semibold text-destructive">Overdue</p>
              <ul className="space-y-1 text-sm">
                {week.overdue.map((t, i) => (
                  <WeekLine
                    key={`o${i}`}
                    app={t.app}
                    href={t.href}
                    title={t.title}
                    note={formatDate(t.due!)}
                  />
                ))}
              </ul>
            </li>
          ) : null}
          {week.days.map((d) => (
            <li key={d.date}>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {dayLabel(d.date, today)}
              </p>
              <ul className="space-y-1 text-sm">
                {d.meetings.map((m) => (
                  <WeekLine
                    key={m.id}
                    app="board"
                    href={meetingHref(m.id)}
                    title={m.title}
                    note="Meeting"
                  />
                ))}
                {d.tasks.map((t, i) => (
                  <WeekLine
                    key={`${d.date}${i}`}
                    app={t.app}
                    href={t.href}
                    title={t.title}
                    note="Due"
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function WeekLine({
  app,
  href,
  title,
  note,
}: {
  app: SuiteApp | "hub";
  href: string | undefined;
  title: string;
  note: string;
}) {
  return (
    <li data-app={app} className="flex items-center gap-2">
      <AppLogo app={app} size={16} />
      {href ? (
        <a href={href} className="min-w-0 flex-1 truncate font-medium hover:underline">
          {title}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">{note}</span>
    </li>
  );
}

/** Choose which panels show (H-03). Saved for the person, on every organization. */
export function PanelChooser({
  hidden,
  onChange,
}: {
  hidden: PanelId[];
  onChange: (hidden: PanelId[]) => void;
}) {
  return (
    <fieldset className="rounded-lg border bg-card p-4 shadow-sm">
      <legend className="px-1 text-sm font-semibold">Show on your dashboard</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PANELS.map((p) => (
          <li key={p.id} className="flex items-start gap-2">
            <input
              id={`panel-${p.id}`}
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={!hidden.includes(p.id)}
              onChange={(e) =>
                onChange(e.target.checked ? hidden.filter((x) => x !== p.id) : [...hidden, p.id])
              }
            />
            <label htmlFor={`panel-${p.id}`} className="text-sm">
              <span className="font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.help}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function DashboardPanels({
  orgId,
  userId,
  urls,
  hidden = [],
  timeZone = "UTC",
}: {
  orgId: string;
  userId: string;
  urls: Partial<Record<SuiteApp, string>>;
  hidden?: PanelId[];
  timeZone?: string;
}) {
  const shows = (id: PanelId) => !hidden.includes(id);
  const state = useAsync(async (): Promise<DashboardData | null> => {
    const client = getSupabaseBrowserClient();
    return client ? loadDashboard(client, { orgId, userId, urls }) : null;
  }, [orgId, userId]);
  const d = state.data;
  if (state.loading && !d)
    return <p className="mb-6 text-sm text-muted-foreground">Loading your dashboard…</p>;
  if (!d) return null;

  const open = (app: SuiteApp, path: string) =>
    urls[app] ? `${urls[app]!.replace(/\/+$/, "")}${path}` : undefined;
  const next = d.meetings?.[0];
  const money = d.money;
  const today = todayIn(timeZone);
  const week = thisWeek(d.tasks, d.meetings, today);
  const meetingHref = (id: string) => open("board", `/board/meetings/${id}?org=${orgId}`);
  const main = shows("week") || shows("tasks") || shows("money");
  const side = shows("meetings") || shows("decisions") || shows("officers");

  return (
    <div className="mb-8 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Open tasks"
          value={d.tasks ? String(d.tasks.length) : "—"}
          sub={
            d.tasks
              ? d.tasks.length
                ? `Next: ${d.tasks[0]!.title}`
                : "You're all caught up"
              : "No apps with tasks yet"
          }
        />
        <Tile
          app="board"
          label="Next meeting"
          value={next ? formatDate(next.meeting_date) : "—"}
          sub={next ? next.title : d.meetings ? "None scheduled" : "OpenBoardApp not in use"}
        />
        <Tile
          app="charter"
          label="Current members"
          value={d.membership ? String(d.membership.current) : "—"}
          sub={
            d.membership
              ? `${d.membership.pending} waiting · ${d.membership.renewals} renewing soon`
              : "OpenCharterApp not in use"
          }
        />
        <Tile
          app="ledger"
          label="Net this year"
          value={money ? formatMoney(money.net, { currency: money.currency, sign: true }) : "—"}
          sub={
            money
              ? `${formatMoney(money.revenue, { currency: money.currency })} in`
              : "OpenLedgerApp not in use"
          }
        />
      </div>

      <div className={`grid gap-6 ${main && side ? "lg:grid-cols-3" : ""}`}>
        {main ? (
          <div className={`space-y-6 ${side ? "lg:col-span-2" : ""}`}>
            {shows("week") ? (
              <WeekPanel week={week} today={today} meetingHref={meetingHref} />
            ) : null}
            {shows("tasks") ? (
              <Panel title="Your tasks">
                {!d.tasks ? (
                  <Empty>
                    Tasks from your apps show here: action items, join requests, seats to fill,
                    recurring transactions.
                  </Empty>
                ) : d.tasks.length === 0 ? (
                  <Empty>Nothing waiting for you. Nice.</Empty>
                ) : (
                  <ul className="divide-y">
                    {d.tasks.slice(0, 8).map((t, i) => (
                      <TaskRow
                        key={`${t.app}-${t.title}-${i}`}
                        t={t}
                        onDone={() => void state.reload()}
                      />
                    ))}
                    {d.tasks.length > 8 ? (
                      <li className="pt-2 text-xs text-muted-foreground">
                        and {d.tasks.length - 8} more in your apps
                      </li>
                    ) : null}
                  </ul>
                )}
              </Panel>
            ) : null}

            {shows("money") ? (
              <Panel title="Money this year" app="ledger">
                {!money ? (
                  <NotHere app="ledger" href={open("ledger", `/ledger?org=${orgId}`)} />
                ) : money.months.length === 0 ? (
                  <Empty>No transactions this year yet.</Empty>
                ) : (
                  <>
                    <dl className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Money in</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatMoney(money.revenue, { currency: money.currency })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Money out</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatMoney(money.expenses, { currency: money.currency })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Net</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatMoney(money.net, { currency: money.currency, sign: true })}
                        </dd>
                      </div>
                    </dl>
                    <MonthBars data={money} currency={money.currency} />
                  </>
                )}
              </Panel>
            ) : null}
          </div>
        ) : null}

        {side ? (
          <div className="space-y-6">
            {shows("meetings") ? (
              <Panel title="Upcoming meetings" app="board">
                {!d.meetings ? (
                  <NotHere app="board" href={open("board", `/board?org=${orgId}`)} />
                ) : d.meetings.length === 0 ? (
                  <Empty>No meetings scheduled.</Empty>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.meetings.slice(0, 4).map((m) => (
                      <li key={m.id}>
                        <a className="font-medium hover:underline" href={meetingHref(m.id)}>
                          {m.title}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(m.meeting_date)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            {shows("decisions") ? (
              <Panel title="Recent decisions" app="board">
                {!d.decisions ? (
                  <NotHere app="board" href={open("board", `/board?org=${orgId}`)} />
                ) : d.decisions.length === 0 ? (
                  <Empty>No decisions recorded yet.</Empty>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.decisions.map((x, i) => (
                      <li key={i}>
                        <p className="line-clamp-2">{x.motion_text}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {x.outcome} · {formatDate(x.meeting_date)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            {shows("officers") ? (
              <Panel title="Officers" app="charter">
                {!d.membership ? (
                  <NotHere app="charter" href={open("charter", `/orgs/${orgId}`)} />
                ) : d.membership.officers.length === 0 ? (
                  <Empty>No officers recorded.</Empty>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {d.membership.officers.slice(0, 6).map((o, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{o.title}</span>
                        <span className="truncate font-medium">{o.holder}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.membership?.units && d.membership.units > 1 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {d.membership.units} units, chapters included
                  </p>
                ) : null}
              </Panel>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One task: a link to where it's done, and Done (or Skip) when it can be finished here (S-19). */
function TaskRow({ t, onDone }: { t: DashboardTask; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  async function finish() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await completeTask(client, t);
      setFinished(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }
  if (finished) return null;
  return (
    <li data-app={t.app} className="py-2.5">
      <div className="flex items-center gap-3">
        <AppLogo app={t.app} size={22} label />
        <div className="min-w-0 flex-1">
          <a href={t.href} className="block truncate text-sm font-medium hover:underline">
            {t.title}
          </a>
          {t.detail ? <p className="truncate text-xs text-muted-foreground">{t.detail}</p> : null}
        </div>
        {t.due ? (
          <span
            className={`shrink-0 text-xs tabular-nums ${t.due < new Date().toISOString().slice(0, 10) ? "font-semibold text-destructive" : "text-muted-foreground"}`}
          >
            {formatDate(t.due)}
          </span>
        ) : null}
        {t.complete && !asking ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            disabled={busy}
            aria-label={`${t.complete.label}: ${t.title}`}
            onClick={() => (t.complete!.confirm ? setAsking(true) : void finish())}
          >
            {busy ? "…" : t.complete.label}
          </button>
        ) : null}
      </div>
      {asking && t.complete?.confirm ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-xs"
          role="group"
          aria-label="Confirm"
        >
          <span>{t.complete.confirm}</span>
          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground"
            onClick={() => void finish()}
          >
            {t.complete.label}
          </button>
          <button
            type="button"
            className="rounded-md border border-input px-2 py-1"
            onClick={() => setAsking(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 pl-9 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
