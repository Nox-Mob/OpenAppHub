// A few live numbers from one app on the dashboard (S-03): read through the app's api_* views,
// with the reader's own permissions. Nothing shows while loading, on error, or when the app's
// views aren't on this database.
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { loadSummary } from "@/lib/app-summaries";
import { useAsync } from "@/lib/use-async";

export function AppSummary({ app, orgId }: { app: "charter" | "board" | "ledger"; orgId: string }) {
  const summary = useAsync(async () => {
    const client = getSupabaseBrowserClient();
    return client ? loadSummary(client, app, orgId) : null;
  }, [app, orgId]);
  if (!summary.data) return null;
  return (
    <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm" aria-label="Summary">
      {summary.data.map((l) => (
        <div key={l.label}>
          <dt className="text-xs text-muted-foreground">{l.label}</dt>
          <dd className="font-medium">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}
