// Supabase's invite email signs the new user in by putting tokens in the URL
// fragment (#access_token=…&refresh_token=…&type=invite). The hub's browser
// client uses the PKCE flow, which ignores that style, so the invite page picks
// the tokens up itself.

export type HashSession = { access_token: string; refresh_token: string; type: string | null };

export function sessionFromHash(hash: string): HashSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, type: params.get("type") };
}
