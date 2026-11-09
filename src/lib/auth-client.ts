// Browser-side auth actions used by the sign-in screens.
import { getSupabaseBrowserClient } from "@shared/supabase/client";

export function callbackUrl(next: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Full navigation, so the server sees the new session cookie on the next render. */
export function goTo(url: string) {
  window.location.assign(url);
}

export async function signOut() {
  await getSupabaseBrowserClient()?.auth.signOut();
  goTo("/");
}

/** Turns Supabase Auth errors into messages people can act on. */
export function authErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error) return "";
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match an account.";
    case "email_not_confirmed":
      return "Confirm your email address first. Check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return "Choose a stronger password (at least 8 characters).";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "signup_disabled":
      return "Sign-ups are closed for now.";
    case "same_password":
      return "Choose a password you haven't used here before.";
    default:
      return error.message || "Something went wrong. Try again.";
  }
}

export function validateNextSearch(search: Record<string, unknown>): { next?: string } {
  return typeof search["next"] === "string" ? { next: search["next"] } : {};
}
