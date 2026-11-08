// `next` handling for sign-in and sign-up (AGENTS step 10, SHARED-SPEC §4.1).
// The hub only follows `next` to suite origins: its own origin, VITE_HUB_URL
// and the apps in VITE_SUITE_URLS. Anything else falls back to "/".
import { hubUrl, suiteUrls } from "@shared/supabase/hosted";

export function allowedOrigins(currentOrigin?: string): string[] {
  const origins = new Set<string>();
  if (currentOrigin) origins.add(currentOrigin);
  try {
    const hub = hubUrl("/");
    if (hub.startsWith("http")) origins.add(new URL(hub).origin);
  } catch {
    // no hub URL configured
  }
  for (const url of Object.values(suiteUrls())) if (url) origins.add(url);
  return [...origins];
}

/**
 * Returns a URL that's safe to redirect to after sign-in: a same-origin path
 * ("/billing") or an absolute URL on a suite origin. Otherwise "/".
 */
export function safeNext(
  next: unknown,
  currentOrigin: string,
  origins: string[] = allowedOrigins(currentOrigin),
): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return "/";
  // Reject control characters and backslashes, which browsers may normalise into "//".
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(next)) return "/";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return "/";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "/";
  if (url.username || url.password) return "/";
  if (!origins.includes(url.origin)) return "/";
  if (url.origin === currentOrigin) return `${url.pathname}${url.search}${url.hash}` || "/";
  return url.toString();
}

/** True when `next` points at a Charter join page (charter.<apex>/join/…), §4.5. */
export function isCharterJoinNext(next: string): boolean {
  const charter = suiteUrls().charter;
  if (!charter) return false;
  try {
    const url = new URL(next);
    return url.origin === charter && url.pathname.startsWith("/join/");
  } catch {
    return false;
  }
}

/** This site's origin: the browser's, or VITE_HUB_URL's during SSR. */
export function currentOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  try {
    return new URL(hubUrl("/")).origin;
  } catch {
    return "";
  }
}
