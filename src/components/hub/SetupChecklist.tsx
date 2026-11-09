import { useState } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { Button } from "@/components/ui/button";
import { must, useAsync } from "@/lib/use-async";

export type SetupStatus = {
  preferences_done: boolean;
  dismissed: boolean;
  member_count: number;
  pending_invitations: number;
  has_billing_contact: boolean;
};

export type SetupItem = { id: string; label: string; help: string; href: string; done: boolean };

/** The dashboard's "Get set up" steps, from hub_org_setup_status. */
export function setupItems(s: SetupStatus): SetupItem[] {
  return [
    {
      id: "organization",
      label: "Create your organization",
      help: "Done. Rename it any time in Settings.",
      href: "/settings",
      done: true,
    },
    {
      id: "region",
      label: "Set your time zone and currency",
      help: "Every app shows dates and money this way.",
      href: "/welcome?step=region",
      done: s.preferences_done,
    },
    {
      id: "team",
      label: "Invite the people who run it with you",
      help: "Board members, staff or volunteers.",
      href: "/members",
      done: s.member_count > 1 || s.pending_invitations > 0,
    },
    {
      id: "billing",
      label: "Choose where invoices go (optional)",
      help: "A treasurer's address, if it isn't yours.",
      href: "/settings#billing-contact",
      done: s.has_billing_contact,
    },
  ];
}

/**
 * Owners and admins see this on the dashboard until every step is done or they
 * dismiss it. Shows nothing if the hub migration isn't there yet.
 */
export function SetupChecklist({ orgId }: { orgId: string }) {
  const supabase = getSupabaseBrowserClient();
  const status = useAsync(async () => {
    if (!supabase) return null;
    const rows = (await must(supabase.rpc("hub_org_setup_status", { p_org: orgId }))) as
      SetupStatus[] | null;
    return rows?.[0] ?? null;
  }, [orgId, supabase]);
  const [hidden, setHidden] = useState(false);
  const s = status.data;
  if (!s || s.dismissed || hidden) return null;
  const items = setupItems(s);
  const done = items.filter((i) => i.done).length;
  const allDone = done === items.length;

  async function dismiss() {
    setHidden(true);
    await supabase?.rpc("hub_mark_org_setup", { p_org: orgId, p_step: "dismiss" });
  }

  return (
    <section
      aria-label="Get set up"
      className="mb-8 rounded-lg border border-primary/30 bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{allDone ? "You're all set" : "Get set up"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {allDone
              ? "Your organization is ready. Open an app below to start."
              : `${done} of ${items.length} done. A few minutes now saves time later.`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
          {allDone ? "Close" : "Hide"}
        </Button>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <ol className="mt-4 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/60"
              data-done={item.done || undefined}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${
                  item.done
                    ? "border-success bg-success text-white"
                    : "border-border text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="text-sm">
                <span
                  className={`font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}
                >
                  {item.label}
                </span>
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                <span className="block text-muted-foreground">{item.help}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
