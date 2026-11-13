// One approval a workflow asked for (core 0014, C-08): what it is, who was asked and what they
// said, and Approve / Decline for someone who still has to answer.
import { useState } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { formatDate } from "@shared/format";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { must, useAsync } from "@/lib/use-async";

export type Approval = {
  id: string;
  org_name: string;
  what: string;
  details: string;
  mode: "first" | "all";
  outcome: "pending" | "approved" | "declined" | "timed_out" | "cancelled";
  due_at: string | null;
  created_at: string;
  decided_at: string | null;
  workflow: string | null;
  can_answer: boolean;
  responses: Array<{ name: string; decision: string; comment: string }>;
};

export const OUTCOME_LABEL: Record<Approval["outcome"], string> = {
  pending: "Waiting for answers",
  approved: "Approved",
  declined: "Declined",
  timed_out: "Nobody answered in time",
  cancelled: "Cancelled",
};

export function ApprovalScreen({ id }: { id: string }) {
  const supabase = getSupabaseBrowserClient();
  const a = useAsync(async () => {
    if (!supabase) return null;
    return (await must(supabase.rpc("approval", { p_id: id }))) as Approval;
  }, [id]);
  return (
    <>
      <PageHeader title="Approval" description={a.data?.org_name} />
      <div className="max-w-2xl space-y-6">
        {a.error ? (
          <Alert variant="destructive">This approval wasn't found, or isn't yours to see.</Alert>
        ) : null}
        {a.loading && !a.data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {a.data ? <ApprovalView a={a.data} onDecided={() => void a.reload()} /> : null}
      </div>
    </>
  );
}

export function ApprovalView({
  a,
  onDecided,
  decide: decideWith,
}: {
  a: Approval;
  onDecided: () => void;
  /** Answers the approval; returns an error message or null (default: decide_approval). */
  decide?: (decision: "approved" | "declined", comment: string) => Promise<string | null>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(decision: "approved" | "declined") {
    setBusy(true);
    setError(null);
    const err = decideWith
      ? await decideWith(decision, comment.trim())
      : await (async () => {
          const supabase = getSupabaseBrowserClient();
          if (!supabase) return "No connection";
          const { error: e } = await supabase.rpc("decide_approval", {
            p_id: a.id,
            p_decision: decision,
            p_comment: comment.trim(),
          });
          return e ? e.message : null;
        })();
    setBusy(false);
    if (err) setError(err);
    else onDecided();
  }
  return (
    <>
      <Panel title={a.what} description={OUTCOME_LABEL[a.outcome]}>
        {a.details ? <p className="whitespace-pre-line text-sm">{a.details}</p> : null}
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-muted-foreground">Asked</dt>
          <dd>{formatDate(a.created_at, { time: true })}</dd>
          <dt className="text-muted-foreground">How it's decided</dt>
          <dd>{a.mode === "all" ? "Everyone asked must approve" : "The first answer decides"}</dd>
          {a.due_at ? (
            <>
              <dt className="text-muted-foreground">Answer by</dt>
              <dd>{formatDate(a.due_at, { time: true })}</dd>
            </>
          ) : null}
          {a.workflow ? (
            <>
              <dt className="text-muted-foreground">From the workflow</dt>
              <dd>{a.workflow}</dd>
            </>
          ) : null}
        </dl>
      </Panel>
      {a.can_answer ? (
        <Panel title="Your answer">
          <div className="space-y-2">
            <Label htmlFor="approval-comment">Comment (optional)</Label>
            <textarea
              id="approval-comment"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          {error ? (
            <Alert variant="destructive" className="mt-3">
              {error}
            </Alert>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button disabled={busy} onClick={() => void decide("approved")}>
              Approve
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void decide("declined")}>
              Decline
            </Button>
          </div>
        </Panel>
      ) : null}
      <Panel title="Who was asked">
        <ul className="divide-y text-sm">
          {a.responses.map((r, i) => (
            <li key={i} className="py-2">
              <span className="font-medium">{r.name}</span>{" "}
              <span className="text-muted-foreground">
                ·{" "}
                {r.decision === "no answer"
                  ? "No answer yet"
                  : r.decision === "approved"
                    ? "Approved"
                    : "Declined"}
              </span>
              {r.comment ? <p className="mt-0.5 text-muted-foreground">"{r.comment}"</p> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
