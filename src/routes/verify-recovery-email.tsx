import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Confirms a recovery email (core 0019). Opening the link changes nothing by itself: the person
// signs in and presses Confirm.
export const Route = createFileRoute("/verify-recovery-email")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = typeof search["token"] === "string" ? search["token"] : "";
    return /^[0-9a-f]{64}$/.test(token) ? { token } : {};
  },
  head: () => ({ meta: [{ title: "Confirm your recovery email · OpenAppHub" }] }),
  component: VerifyRecoveryEmailPage,
});

function VerifyRecoveryEmailPage() {
  const { user } = Route.useRouteContext();
  const { token } = Route.useSearch();
  const [state, setState] = useState<"idle" | "busy" | "ok" | "bad">("idle");

  if (!token) {
    return (
      <AuthCard title="This link isn't complete">
        <p className="text-sm text-muted-foreground">
          Open the link from the email again, or add your recovery email again on your account page.
        </p>
      </AuthCard>
    );
  }
  if (!user) {
    return (
      <AuthCard title="Sign in to confirm">
        <p className="text-sm text-muted-foreground">
          Sign in to the account that added this recovery email, then you'll come back here.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/login" search={{ next: `/verify-recovery-email?token=${token}` }}>
            Sign in
          </Link>
        </Button>
      </AuthCard>
    );
  }

  async function confirm() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setState("busy");
    const { data, error } = await supabase.rpc("verify_recovery_email", { p_token: token });
    setState(!error && data === true ? "ok" : "bad");
  }

  return (
    <AuthCard title="Confirm your recovery email" description={user.email ?? undefined}>
      {state === "ok" ? (
        <>
          <Alert>Confirmed. If you lose your phone, we can send a link to this address.</Alert>
          <Button
            className="mt-4 w-full"
            onClick={() => window.location.assign("/account#two-step")}
          >
            Back to your account
          </Button>
        </>
      ) : state === "bad" ? (
        <Alert variant="destructive">
          This link has expired, was already used, or belongs to a different account. Add the
          recovery email again on your account page.
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Make this address the place we send a link if you ever lose your phone?
          </p>
          <Button
            className="mt-4 w-full"
            disabled={state === "busy"}
            onClick={() => void confirm()}
          >
            {state === "busy" ? "Confirming…" : "Confirm"}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
