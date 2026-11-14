import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoverTwoStep, sendRecoveryLink } from "@/lib/account-security";

// "Can't use your authenticator app?" (core 0019): a backup code, or a link sent to the
// confirmed recovery email, turns off two-step sign-in so the person can set it up again. The
// person must be signed in with their password; nothing here works without it.
export const Route = createFileRoute("/recover")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = typeof search["token"] === "string" ? search["token"] : "";
    return /^[0-9a-f]{64}$/.test(token) ? { token } : {};
  },
  head: () => ({ meta: [{ title: "Get back into your account · OpenAppHub" }] }),
  component: RecoverPage,
});

function RecoverPage() {
  const { user } = Route.useRouteContext();
  const { token } = Route.useSearch();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) {
    const next = token ? `/recover?token=${token}` : "/recover";
    return (
      <AuthCard title="Sign in first">
        <p className="text-sm text-muted-foreground">
          Sign in with your email and password. When you're asked for the code from your
          authenticator app, choose <strong>Can't use your authenticator app?</strong>
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/login" search={{ next }}>
            Sign in
          </Link>
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Two-step sign-in is off">
        <p className="text-sm text-muted-foreground">
          You're back in. We emailed you about this. Set up two-step sign-in again now, on your new
          phone, and make new backup codes.
        </p>
        <Button className="mt-4 w-full" onClick={() => window.location.assign("/account#two-step")}>
          Set up two-step sign-in
        </Button>
      </AuthCard>
    );
  }

  async function run(input: { code: string } | { token: string }) {
    setBusy(true);
    setError("");
    const res = await recoverTwoStep({ data: input });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setDone(true);
  }

  if (token) {
    return (
      <AuthCard title="Turn off two-step sign-in?" description={user.email ?? undefined}>
        <p className="text-sm text-muted-foreground">
          This link from your recovery email turns off two-step sign-in, so you can set it up again
          on a new phone. If you didn't ask for it, don't continue, and change your password.
        </p>
        {error ? (
          <Alert variant="destructive" className="mt-4">
            {error}
          </Alert>
        ) : null}
        <Button className="mt-4 w-full" disabled={busy} onClick={() => void run({ token })}>
          {busy ? "Turning it off…" : "Turn off two-step sign-in"}
        </Button>
      </AuthCard>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run({ code });
  }

  async function emailLink() {
    setBusy(true);
    setError("");
    const res = await sendRecoveryLink();
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setSent(true);
  }

  return (
    <AuthCard
      title="Can't use your authenticator app?"
      description={user.email ?? undefined}
      footer={
        <Link to="/" className="underline">
          Back
        </Link>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Label htmlFor="backup-code">Type one of your backup codes</Label>
        <Input
          id="backup-code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={busy || code.trim().length < 10}>
          {busy ? "Checking…" : "Use backup code"}
        </Button>
      </form>
      <div className="mt-6 space-y-2 border-t pt-4 text-sm">
        <p className="font-medium">No backup codes?</p>
        <p className="text-muted-foreground">
          If you added a recovery email, we can send a link there. It works for 30 minutes.
        </p>
        {sent ? (
          <Alert>We sent a link to your recovery email. Open it on this device.</Alert>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void emailLink()}
          >
            Email my recovery address
          </Button>
        )}
        <p className="text-muted-foreground">
          Neither works? Contact support at support@openapphub.org from the email you sign in with.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive" className="mt-4">
          {error}
        </Alert>
      ) : null}
    </AuthCard>
  );
}
