import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_EVENT,
  COOKIES,
  PREFERENCE_COOKIES,
  consentCookieString,
  hasConsent,
  parseConsent,
  readConsent,
  saveConsent,
} from "./consent";
import {
  getThemePreference,
  setThemePreference,
  syncThemeWithConsent,
  themeInitScript,
} from "./theme";

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
  sessionStorage.clear();
  document.documentElement.className = "";
}
afterEach(clearCookies);

describe("consent record", () => {
  it("parses the current version only", () => {
    expect(parseConsent("v1-p1-1762700000")).toEqual({
      version: 1,
      preferences: true,
      at: 1762700000,
    });
    expect(parseConsent("v1-p0-1762700000")?.preferences).toBe(false);
    expect(parseConsent("v0-p1-1762700000")).toBeNull(); // older categories: ask again
    expect(parseConsent("v1-p1-x")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
    expect(readConsent("a=1; oah_consent=v1-p1-5; b=2")?.preferences).toBe(true);
  });

  it("builds a 180-day cookie, suite-wide when given a domain", () => {
    expect(
      consentCookieString(
        { preferences: false, at: 5 },
        { domain: ".openapphub.org", secure: true },
      ),
    ).toBe(
      "oah_consent=v1-p0-5; Path=/; Max-Age=15552000; SameSite=Lax; Domain=.openapphub.org; Secure",
    );
  });

  it("necessary is always allowed; preferences need an explicit yes", () => {
    expect(hasConsent("necessary")).toBe(true);
    expect(hasConsent("preferences")).toBe(false);
    saveConsent({ preferences: true });
    expect(hasConsent("preferences")).toBe(true);
    saveConsent({ preferences: false });
    expect(hasConsent("preferences")).toBe(false);
  });

  it("withdrawing consent deletes preference cookies and notifies the page", () => {
    document.cookie = "oah_theme=dark; Path=/";
    document.cookie = "oah_org=11111111-1111-4111-8111-111111111111; Path=/";
    const seen = vi.fn();
    window.addEventListener(CONSENT_EVENT, seen);
    saveConsent({ preferences: false });
    window.removeEventListener(CONSENT_EVENT, seen);
    expect(document.cookie).not.toContain("oah_theme");
    expect(document.cookie).toContain("oah_org="); // required: untouched
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("every cookie we set is listed with a category, purpose and duration", () => {
    for (const c of COOKIES) {
      expect(c.purpose.length).toBeGreaterThan(10);
      expect(c.duration.length).toBeGreaterThan(2);
    }
    expect(PREFERENCE_COOKIES).toEqual(["oah_theme"]);
    expect(COOKIES.filter((c) => c.category === "necessary").map((c) => c.name)).toContain(
      "oah_org",
    );
  });
});

describe("theme follows consent", () => {
  it("without consent: works for the session, sets no cookie", () => {
    setThemePreference("dark");
    expect(document.cookie).not.toContain("oah_theme");
    expect(sessionStorage.getItem("oah_theme")).toBe("dark");
    expect(getThemePreference()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("with consent: saved in the cookie", () => {
    saveConsent({ preferences: true });
    setThemePreference("light");
    expect(document.cookie).toContain("oah_theme=light");
    expect(sessionStorage.getItem("oah_theme")).toBeNull();
  });

  it("accepting later moves the session choice into the cookie", () => {
    setThemePreference("dark");
    saveConsent({ preferences: true });
    syncThemeWithConsent();
    expect(document.cookie).toContain("oah_theme=dark");
    expect(sessionStorage.getItem("oah_theme")).toBeNull();
  });

  it("a theme cookie without consent is removed, keeping the choice for the session", () => {
    document.cookie = "oah_theme=dark; Path=/"; // set before the banner existed
    syncThemeWithConsent();
    expect(document.cookie).not.toContain("oah_theme");
    expect(getThemePreference()).toBe("dark");
  });

  it("the pre-paint script reads the session choice too", () => {
    sessionStorage.setItem("oah_theme", "dark");
    new Function(themeInitScript())();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
