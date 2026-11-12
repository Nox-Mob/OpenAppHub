// The dashboard's summary per app (S-03, SHARED-SPEC §3.6), read from each app's read-only
// api_* views (documented in each app's docs/INTEGRATION.md). The views apply the reader's own row
// security. They don't exist on a database without that app, or before its migration 0002; then
// the summary is simply left out (feature detection).
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatMoney } from "@shared/format";

export type SummaryLine = { label: string; value: string };

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { code?: string; message: string } | null };

/** Errors that mean "this app's views aren't here": missing relation or schema not exposed. */
export function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    ["42P01", "PGRST205", "PGRST106", "42501"].includes(error.code ?? "") ||
    /does not exist|schema must be one of/i.test(error.message ?? "")
  );
}

async function rows(q: PromiseLike<Result>): Promise<Row[] | null> {
  const { data, error } = await q;
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(error.message);
  }
  return data ?? [];
}

export function boardSummary(meetings: Row[], decisions: Row[], today: string): SummaryLine[] {
  const next = meetings
    .filter((m) => m["status"] === "scheduled" && String(m["meeting_date"]) >= today)
    .sort((a, b) => String(a["meeting_date"]).localeCompare(String(b["meeting_date"])))[0];
  const latest = decisions[0];
  return [
    {
      label: "Next meeting",
      value: next
        ? `${next["title"]}, ${formatDate(String(next["meeting_date"]))}`
        : "None scheduled",
    },
    {
      label: "Latest decision",
      value: latest ? `${latest["motion_text"]} (${latest["outcome"]})` : "None yet",
    },
  ];
}

export function charterSummary(seats: Row[], units: number | null, orgId: string): SummaryLine[] {
  const top = seats.filter((s) => s["unit_id"] === orgId && s["holder_name"]);
  const lines: SummaryLine[] = [];
  if (units !== null && units > 1)
    lines.push({ label: "Units", value: `${units} (with chapters)` });
  lines.push({
    label: "Officers",
    value: top.length
      ? top
          .slice(0, 3)
          .map((s) => `${s["title"]}: ${s["holder_name"]}`)
          .join(", ") + (top.length > 3 ? `, and ${top.length - 3} more` : "")
      : "None recorded",
  });
  return lines;
}

export function ledgerSummary(months: Row[]): SummaryLine[] {
  if (months.length === 0) return [{ label: "This year", value: "No transactions yet" }];
  const currency = String(months[0]?.["currency"] ?? "USD");
  const sum = (k: string) => months.reduce((a, m) => a + Number(m[k] ?? 0), 0);
  return [
    { label: "Money in this year", value: formatMoney(sum("revenue_cents"), { currency }) },
    { label: "Money out this year", value: formatMoney(sum("expense_cents"), { currency }) },
    { label: "Net", value: formatMoney(sum("net_cents"), { currency, sign: true }) },
  ];
}

/** The summary lines for one app, or null when the app's views aren't on this database. */
export async function loadSummary(
  client: SupabaseClient,
  app: "charter" | "board" | "ledger",
  orgId: string,
  now: Date = new Date(),
): Promise<SummaryLine[] | null> {
  const today = now.toISOString().slice(0, 10);
  if (app === "board") {
    const db = client.schema("board");
    const [meetings, decisions] = await Promise.all([
      rows(
        db
          .from("api_meetings")
          .select("title, meeting_date, status")
          .eq("org_id", orgId)
          .gte("meeting_date", today)
          .order("meeting_date")
          .limit(5),
      ),
      rows(
        db
          .from("api_decisions")
          .select("motion_text, outcome, decided_at")
          .eq("org_id", orgId)
          .order("decided_at", { ascending: false })
          .limit(1),
      ),
    ]);
    return meetings && decisions ? boardSummary(meetings, decisions, today) : null;
  }
  if (app === "charter") {
    const db = client.schema("charter");
    const [seats, count] = await Promise.all([
      rows(
        db
          .from("api_board_seats")
          .select("unit_id, title, holder_name")
          .eq("org_id", orgId)
          .eq("unit_id", orgId)
          .order("title"),
      ),
      rows(db.from("api_unit_count").select("units").eq("org_id", orgId)),
    ]);
    if (!seats || !count) return null;
    return charterSummary(seats, count[0] ? Number(count[0]["units"]) : null, orgId);
  }
  const months = await rows(
    client
      .schema("ledger")
      .from("api_period_summaries")
      .select("month, currency, revenue_cents, expense_cents, net_cents")
      .eq("org_id", orgId)
      .gte("month", `${now.getUTCFullYear()}-01-01`),
  );
  return months ? ledgerSummary(months) : null;
}
