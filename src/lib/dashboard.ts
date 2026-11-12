// The hub's dashboard data (S-03, S-15): key information from every app, read through each app's
// read-only api_* views with the reader's own permissions (docs/INTEGRATION.md in each app). Each
// source is feature-detected: null means that app (or its view) isn't on this database yet.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissing } from "@shared/integrations/detect";

export type SuiteApp = "charter" | "board" | "ledger";

export type DashboardTask = {
  app: SuiteApp;
  title: string;
  detail: string | null;
  due: string | null;
  href: string;
};
export type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  minutes_status: string | null;
};
export type Decision = { motion_text: string; outcome: string; meeting_date: string };
export type MoneyMonth = {
  month: string;
  revenue_cents: number;
  expense_cents: number;
  net_cents: number;
};
export type Money = {
  currency: string;
  months: MoneyMonth[];
  revenue: number;
  expenses: number;
  net: number;
};
export type Membership = {
  current: number;
  pending: number;
  renewals: number;
  units: number | null;
  officers: { title: string; holder: string }[];
};

export type DashboardData = {
  tasks: DashboardTask[] | null;
  meetings: Meeting[] | null;
  decisions: Decision[] | null;
  money: Money | null;
  membership: Membership | null;
};

type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: { code?: string; message: string } | null };

async function rows(q: PromiseLike<Res>): Promise<Row[] | null> {
  try {
    const { data, error } = await q;
    if (error) {
      // A missing app or view hides its panels; anything else hides them too, but say why.
      if (!isMissing(error)) console.warn(`Dashboard: ${error.message}`);
      return null;
    }
    return data ?? [];
  } catch {
    return null;
  }
}

/** A link into an app for this organization (Charter's links already name the unit). */
export function appHref(base: string | undefined, link: string, orgId: string): string {
  const root = (base ?? "").replace(/\/+$/, "");
  if (link.startsWith("/orgs/")) return root + link;
  return `${root}${link}${link.includes("?") ? "&" : "?"}org=${orgId}`;
}

export function mergeTasks(
  p: { board: Row[] | null; charter: Row[] | null; ledger: Row[] | null },
  urls: Partial<Record<SuiteApp, string>>,
  orgId: string,
): DashboardTask[] | null {
  if (!p.board && !p.charter && !p.ledger) return null;
  const tasks: DashboardTask[] = [
    ...(p.board ?? []).map((r) => ({
      app: "board" as const,
      title: String(r["title"]),
      detail: r["meeting_title"] ? `From ${r["meeting_title"]}` : "Action item",
      due: (r["due_date"] as string | null) ?? null,
      href: appHref(urls.board, String(r["link"] ?? "/board/tasks"), orgId),
    })),
    ...(p.charter ?? []).map((r) => ({
      app: "charter" as const,
      title: String(r["title"]),
      detail: (r["unit_name"] as string | null) ?? null,
      due: r["kind"] === "vacant_seat" ? null : ((r["due_on"] as string | null) ?? null),
      href: appHref(urls.charter, String(r["link"]), orgId),
    })),
    ...(p.ledger ?? []).map((r) => ({
      app: "ledger" as const,
      title: String(r["title"]),
      detail: "Recurring transaction",
      due: (r["due_on"] as string | null) ?? null,
      href: appHref(urls.ledger, String(r["link"] ?? "/templates"), orgId),
    })),
  ];
  // Soonest first; undated ones after.
  return tasks.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export function summarizeMoney(months: Row[] | null): Money | null {
  if (!months) return null;
  const list: MoneyMonth[] = months
    .map((m) => ({
      month: String(m["month"]),
      revenue_cents: Number(m["revenue_cents"] ?? 0),
      expense_cents: Number(m["expense_cents"] ?? 0),
      net_cents: Number(m["net_cents"] ?? 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const sum = (k: keyof MoneyMonth) => list.reduce((a, m) => a + Number(m[k]), 0);
  return {
    currency: String(months[0]?.["currency"] ?? "USD"),
    months: list,
    revenue: sum("revenue_cents"),
    expenses: sum("expense_cents"),
    net: sum("net_cents"),
  };
}

export function summarizeMembership(
  summary: Row[] | null,
  units: Row[] | null,
  seats: Row[] | null,
): Membership | null {
  if (!summary && !seats) return null;
  const s = summary?.[0];
  return {
    current: Number(s?.["current_members"] ?? 0),
    pending: Number(s?.["pending_requests"] ?? 0),
    renewals: Number(s?.["renewals_due"] ?? 0),
    units: units?.[0] ? Number(units[0]["units"]) : null,
    officers: (seats ?? [])
      .filter((r) => r["holder_name"])
      .map((r) => ({ title: String(r["title"]), holder: String(r["holder_name"]) })),
  };
}

export async function loadDashboard(
  client: SupabaseClient,
  p: { orgId: string; userId: string; urls: Partial<Record<SuiteApp, string>>; now?: Date },
): Promise<DashboardData> {
  const now = p.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const yearStart = `${now.getUTCFullYear()}-01-01`;
  const board = client.schema("board");
  const charter = client.schema("charter");
  const ledger = client.schema("ledger");
  const [actions, charterTasks, ledgerTasks, meetings, decisions, months, members, units, seats] =
    await Promise.all([
      rows(
        board
          .from("api_action_items")
          .select("title, due_date, status, meeting_title, link")
          .eq("org_id", p.orgId)
          .eq("assignee_id", p.userId)
          .in("status", ["open", "in_progress"]),
      ),
      rows(
        charter
          .from("api_tasks")
          .select("kind, title, unit_name, due_on, link")
          .eq("org_id", p.orgId),
      ),
      rows(ledger.from("api_tasks").select("title, due_on, link").eq("org_id", p.orgId)),
      rows(
        board
          .from("api_meetings")
          .select("id, title, meeting_date, minutes_status, status")
          .eq("org_id", p.orgId)
          .gte("meeting_date", today)
          .in("status", ["scheduled", "in_progress"])
          .order("meeting_date")
          .limit(4),
      ),
      rows(
        board
          .from("api_decisions")
          .select("motion_text, outcome, meeting_date")
          .eq("org_id", p.orgId)
          .order("decided_at", { ascending: false })
          .limit(4),
      ),
      rows(
        ledger
          .from("api_period_summaries")
          .select("month, currency, revenue_cents, expense_cents, net_cents")
          .eq("org_id", p.orgId)
          .gte("month", yearStart),
      ),
      rows(
        charter
          .from("api_member_summary")
          .select("current_members, pending_requests, renewals_due")
          .eq("org_id", p.orgId),
      ),
      rows(charter.from("api_unit_count").select("units").eq("org_id", p.orgId)),
      rows(
        charter
          .from("api_board_seats")
          .select("title, holder_name")
          .eq("org_id", p.orgId)
          .eq("unit_id", p.orgId)
          .order("title"),
      ),
    ]);
  return {
    tasks: mergeTasks(
      { board: actions, charter: charterTasks, ledger: ledgerTasks },
      p.urls,
      p.orgId,
    ),
    meetings: meetings as Meeting[] | null,
    decisions: decisions as Decision[] | null,
    money: summarizeMoney(months),
    membership: summarizeMembership(members, units, seats),
  };
}
