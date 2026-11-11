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
 * Preview domains (VITE_PREVIEW_DOMAINS, comma-separated, staging only): an app Worker's branch
 * previews are served at https://<branch>.<domain>, for example
 * https://staging.charter.staging.openapphub.org. Sign-in may return to those too.
 */
export function previewDomains(
  raw: string | undefined = import.meta.env.VITE_PREVIEW_DOMAINS,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
}

/** True for https://<one label>.<preview domain>, with no port. */
export function isPreviewOrigin(origin: string, domains: string[] = previewDomains()): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.origin !== origin) return false;
  return domains.some((d) => {
    if (!url.hostname.endsWith(`.${d}`)) return false;
    const label = url.hostname.slice(0, -d.length - 1);
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
  });
}

/**
 * Returns a URL that's safe to redirect to after sign-in: a same-origin path
 * ("/billing") or an absolute URL on a suite origin. Otherwise "/".
 */
export function safeNext(
  next: unknown,
  currentOrigin: string,
  origins: string[] = allowedOrigins(currentOrigin),
  domains: string[] = previewDomains(),
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
  if (!origins.includes(url.origin) && !isPreviewOrigin(url.origin, domains)) return "/";
  if (url.origin === currentOrigin) return `${url.pathname}${url.search}${url.hash}` || "/";
  return url.toString();
}

/** True when `next` points at a Charter join page (charter.<apex>/join/…), §4.5. */
export function isCharterJoinNext(next: string): boolean {
  const charter = suiteUrls().charter;
  if (!charter) return false;
  try {
    const url = new URL(next);
    const charterPreviews = previewDomains().filter((d) => d.startsWith("charter."));
    const isCharter = url.origin === charter || isPreviewOrigin(url.origin, charterPreviews);
    return isCharter && url.pathname.startsWith("/join/");
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
