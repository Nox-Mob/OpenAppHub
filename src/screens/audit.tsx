import type { ScreenProps } from "./types";
import { useState } from "react";
import { formatDate } from "@shared/format";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { HelpLink } from "@shared/ui/HelpLink";
import { HELP } from "@/config/help";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeAudit, type AuditEntry } from "@/lib/audit-describe";
import { canManage } from "@/lib/roles";
import { must, useAsync } from "@/lib/use-async";

const PAGE = 50;

export function AuditScreen({ hub }: ScreenProps) {
  const orgId = hub.currentOrgId;
  const supabase = getSupabaseBrowserClient();
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(true);
  const names = useAsync(async () => {
    if (!orgId || !supabase) return {};
    const rows = (await must(supabase.rpc("org_member_directory", { p_org: orgId }))) as {
      user_id: string;
      display_name: string | null;
      email: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.user_id, r.display_name || r.email]));
  }, [orgId, supabase]);
  const first = useAsync(async () => {
    if (!orgId || !supabase || !canManage(hub.role)) return [] as AuditEntry[];
    const rows = (await must(
      supabase.rpc("hub_org_audit", { p_org: orgId, p_limit: PAGE }),
    )) as AuditEntry[];
    setOlder([]);
    setMore(rows.length === PAGE);
    return rows;
  }, [orgId, supabase, hub.role]);

  if (!orgId) return <NoOrganization />;
  if (!canManage(hub.role)) {
    return <Alert>Only the owner and admins can see the audit log.</Alert>;
  }

  const rows = [...(first.data ?? []), ...older];
  async function loadMore() {
    if (!supabase || rows.length === 0) return;
    const last = rows[rows.length - 1]!;
    const next = (await must(
      supabase.rpc("hub_org_audit", { p_org: orgId, p_limit: PAGE, p_before: last.id }),
    )) as AuditEntry[];
    setOlder((o) => [...o, ...next]);
    setMore(next.length === PAGE);
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Changes to this organization, its members and its invitations."
        actions={<HelpLink path={HELP.audit}>About the audit log</HelpLink>}
      />
      <Panel title="Recent changes">
        {first.error ? <Alert variant="destructive">{first.error}</Alert> : null}
        {first.loading && !first.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {rows.length === 0 && !first.loading ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : null}
        <ol className="divide-y">
          {rows.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <time className="w-44 shrink-0 text-xs text-muted-foreground tnum" dateTime={e.at}>
                {formatDate(e.at, { time: true, timeZone: hub.prefs.timeZone })}
              </time>
              <p className="text-sm">
                <span className="font-semibold">{e.actor ? e.actor_name : "System"}</span>{" "}
                <span className="text-muted-foreground">·</span>{" "}
                {describeAudit(e, names.data ?? {})}
              </p>
            </li>
          ))}
        </ol>
        {more && rows.length > 0 ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMore()}>
            Show older
          </Button>
        ) : null}
      </Panel>
    </>
  );
}
