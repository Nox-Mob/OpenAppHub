// Illustrated product previews for the landing page, drawn with the suite's design
// tokens (each wrapper sets data-app, so the app accent applies). Decorative:
// each preview is one image to assistive technology, with a text description.
import type { ReactNode } from "react";
import { formatDate, formatMoney } from "@shared/format";
import type { SuiteApp } from "@shared/supabase/hosted";
import { cn } from "@/lib/utils";

function Window({
  app,
  title,
  label,
  children,
  className,
}: {
  app: SuiteApp;
  title: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-app={app}
      role="img"
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-left text-card-foreground shadow-lg select-none",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="ml-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full bg-app-accent" />
          {title}
        </span>
      </div>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "outline";
const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
  neutral: "bg-secondary text-secondary-foreground",
  outline: "border text-muted-foreground",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-[11px] font-semibold whitespace-nowrap",
        toneClass[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
      {initials}
    </span>
  );
}

export function CharterPreview({ className }: { className?: string }) {
  const members: [string, string, string, Tone, string, number][] = [
    ["AO", "Amara Okafor", "North Shore", "success", "Good", 6000],
    ["JT", "Jonas Tremblay", "Downtown", "warning", "Grace", 9500],
    ["PS", "Priya Shah", "North Shore", "success", "Good", 2000],
    ["ML", "Marcus Lee", "Westside", "danger", "Lapsed", 0],
  ];
  return (
    <Window
      app="charter"
      title="OpenCharterApp · Members"
      label="OpenCharterApp members list: members with their chapter, standing and dues paid."
      className={className}
    >
      <div className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Members</div>
            <div className="text-xs text-muted-foreground">248 across 6 chapters</div>
          </div>
          <div className="flex gap-1.5 text-[11px] font-semibold">
            <span className="rounded-sm border-b-2 border-app-accent px-1.5 py-0.5">All</span>
            <span className="px-1.5 py-0.5 text-muted-foreground">Good</span>
            <span className="px-1.5 py-0.5 text-muted-foreground">Lapsed</span>
          </div>
        </div>
        <div className="mt-3 divide-y rounded-md border">
          {members.map(([ini, name, chapter, tone, standing, paid]) => (
            <div key={name} className="flex items-center gap-2.5 px-3 py-2">
              <Avatar initials={ini} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{chapter}</div>
              </div>
              <Badge tone={tone}>{standing}</Badge>
              <span className="tnum w-16 text-right text-xs">{formatMoney(paid)}</span>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

export function BoardPreview({ className }: { className?: string }) {
  const agenda: [string, Tone, string][] = [
    ["Approve October minutes", "success", "Carried 7–0"],
    ["2027 budget", "success", "Carried 6–1"],
    ["Hall lease renewal", "info", "Tabled"],
  ];
  return (
    <Window
      app="board"
      title="OpenBoardApp · Meeting"
      label="OpenBoardApp meeting: agenda items with vote results, quorum present and an action item."
      className={className}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Regular board meeting</div>
            <div className="text-xs text-muted-foreground">
              {formatDate("2026-11-12")} · Community hall
            </div>
          </div>
          <Badge tone="success">Quorum 7 of 9</Badge>
        </div>
        <div className="mt-3 flex gap-3 border-b text-[11px] font-semibold">
          {["Agenda", "Attendance", "Motions", "Minutes"].map((t, i) => (
            <span
              key={t}
              className={cn(
                "-mb-px pb-1.5",
                i === 2 ? "border-b-2 border-app-accent" : "text-muted-foreground",
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <ol className="mt-2 space-y-1.5">
          {agenda.map(([item, tone, result], i) => (
            <li key={item} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <span className="tnum w-4 text-[11px] text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 truncate text-xs font-medium">{item}</span>
              <Badge tone={tone}>{result}</Badge>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/70 px-3 py-2 text-[11px]">
          <span className="font-semibold">Action item</span>
          <span className="flex-1 truncate text-muted-foreground">
            Send lease terms to members · due {formatDate("2026-11-26")}
          </span>
        </div>
      </div>
    </Window>
  );
}

export function LedgerPreview({ className }: { className?: string }) {
  const bars: [string, number, number][] = [
    ["Jun", 52, 44],
    ["Jul", 61, 50],
    ["Aug", 48, 57],
    ["Sep", 70, 53],
    ["Oct", 76, 60],
    ["Nov", 83, 62],
  ];
  const rows: [string, string, number][] = [
    ["2026-11-08", "Fall food drive donations", 235000],
    ["2026-11-07", "Hall rental, November", -65000],
    ["2026-11-05", "City youth grant, Q4", 500000],
  ];
  return (
    <Window
      app="ledger"
      title="OpenLedgerApp · Dashboard"
      label="OpenLedgerApp dashboard: cash on hand, monthly income and expenses chart, and recent transactions."
      className={className}
    >
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border p-2.5">
            <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Cash on hand
            </div>
            <div className="tnum mt-0.5 text-base font-semibold">{formatMoney(4825012)}</div>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Income · Nov
            </div>
            <div className="tnum mt-0.5 text-base font-semibold">{formatMoney(1248000)}</div>
          </div>
        </div>
        <div className="mt-3 flex h-20 items-end gap-2 rounded-md border px-3 pt-2">
          {bars.map(([m, a, b]) => (
            <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="w-2 rounded-t-sm bg-chart-1" style={{ height: `${a}%` }} />
                <div className="w-2 rounded-t-sm bg-chart-2" style={{ height: `${b}%` }} />
              </div>
              <span className="pb-1 text-[9px] text-muted-foreground">{m}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 divide-y rounded-md border">
          {rows.map(([d, desc, cents]) => (
            <div key={desc} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
              <span className="w-20 text-muted-foreground">{formatDate(d)}</span>
              <span className="flex-1 truncate">{desc}</span>
              <span className={cn("tnum", cents < 0 && "text-destructive")}>
                {formatMoney(cents)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

export const PREVIEWS: Record<SuiteApp, (p: { className?: string }) => ReactNode> = {
  charter: CharterPreview,
  board: BoardPreview,
  ledger: LedgerPreview,
};
