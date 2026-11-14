// The hub's helpers for "Confirm it's you" and the recovery email (core 0019), shaped for the
// shared ReauthDialog and TwoStepSettings: each returns an error message, or null when it worked.
import type { ReauthAction } from "@shared/ui/Reauth";
import { saveRecoveryEmail, sendReauthCode } from "./account-security";

export async function hubSendCode(action: ReauthAction): Promise<string | null> {
  const res = await sendReauthCode({ data: { action } });
  return "error" in res ? res.error : null;
}

export async function hubSaveRecoveryEmail(
  email: string | null,
  token: string,
): Promise<string | null> {
  const res = await saveRecoveryEmail({ data: { email, token } });
  return "error" in res ? res.error : null;
}
