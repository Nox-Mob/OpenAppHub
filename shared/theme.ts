// Light / dark / system theme for every app (SHARED-SPEC §9).
//
// The choice is a cookie, `oah_theme`. In hosted mode it's set on
// VITE_COOKIE_DOMAIN (".openapphub.org"), so choosing a theme in one app makes it
// the default in every app of the suite. "system" (the default) follows the
// device's light/dark setting and keeps following it as that changes.
//
// themeInitScript() goes in <head> so the right class is on <html> before the
// first paint (no flash); it needs `suppressHydrationWarning` on <html>.

import { cookieDomainFor } from "./supabase/hosted";

export type ThemePreference = "light" | "dark" | "system";
export const THEME_COOKIE = "oah_theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];
const ONE_YEAR = 60 * 60 * 24 * 365;

export function parseTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function readThemeCookie(cookieHeader: string): ThemePreference {
  const match = cookieHeader.match(/(?:^|;\s*)oah_theme=([^;]*)/);
  return parseTheme(match?.[1]);
}

export function themeCookieString(
  pref: ThemePreference,
  opts: { domain?: string | undefined; secure?: boolean } = {},
): string {
  const parts = [`${THEME_COOKIE}=${pref}`, "Path=/", `Max-Age=${ONE_YEAR}`, "SameSite=Lax"];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies a preference to <html>: the `dark` class and data-theme="<preference>". */
export function applyTheme(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolveTheme(pref, systemPrefersDark()) === "dark");
  root.dataset["theme"] = pref;
}

export function getThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  return readThemeCookie(document.cookie);
}

/** Saves the choice (suite-wide in hosted mode) and applies it. */
export function setThemePreference(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const domain = cookieDomainFor(location.hostname);
  document.cookie = themeCookieString(pref, { domain, secure: location.protocol === "https:" });
  applyTheme(pref);
}

/** Re-applies "system" when the device switches between light and dark. */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemePreference() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Inline <head> script: applies the saved preference before the first paint. */
export function themeInitScript(): string {
  return `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)oah_theme=(light|dark)/);var p=m?m[1]:"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=p;}catch(e){}})();`;
}
