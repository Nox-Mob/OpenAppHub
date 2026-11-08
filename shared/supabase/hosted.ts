// Hosted-mode helpers (SHARED-SPEC §1.1, §4.1). Safe to import during SSR.

export type AppId = "hub" | "charter" | "board" | "ledger";
export const SUITE_APPS = ["charter", "board", "ledger"] as const;
export type SuiteApp = (typeof SUITE_APPS)[number];

export function isHosted(): boolean {
  return import.meta.env.VITE_HOSTED === "true";
}

export function appId(): AppId {
  return (import.meta.env.VITE_APP_ID as AppId | undefined) ?? "hub";
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Absolute URL on the hub, e.g. hubUrl("/billing"). */
export function hubUrl(path = "/"): string {
  const base = trimSlash(import.meta.env.VITE_HUB_URL ?? "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Parses VITE_SUITE_URLS: "charter=https://charter.openapphub.org,board=…,ledger=…".
 * Unknown keys and malformed URLs are ignored.
 */
export function parseSuiteUrls(raw: string | undefined): Partial<Record<SuiteApp, string>> {
  const out: Partial<Record<SuiteApp, string>> = {};
  for (const part of (raw ?? "").split(",")) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (!key || !value || !(SUITE_APPS as readonly string[]).includes(key)) continue;
    try {
      out[key as SuiteApp] = new URL(value).origin;
    } catch {
      // ignore malformed entries
    }
  }
  return out;
}

export function suiteUrls(): Partial<Record<SuiteApp, string>> {
  return parseSuiteUrls(import.meta.env.VITE_SUITE_URLS);
}

/** Hosted sign-in: send the visitor to the hub, coming back to `next` afterwards. */
export function loginRedirect(next: string): string {
  return hubUrl(`/login?next=${encodeURIComponent(next)}`);
}
