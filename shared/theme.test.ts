import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseTheme,
  readThemeCookie,
  resolveTheme,
  themeCookieString,
  themeInitScript,
} from "./theme";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: dark && q.includes("dark"),
    addEventListener() {},
    removeEventListener() {},
  }));
  window.matchMedia = globalThis.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  document.cookie = "oah_theme=; Max-Age=0; Path=/";
});

describe("theme", () => {
  it("parses preferences, defaulting to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });

  it("reads the cookie among others", () => {
    expect(readThemeCookie("a=1; oah_theme=dark; b=2")).toBe("dark");
    expect(readThemeCookie("xoah_theme=dark")).toBe("system");
    expect(readThemeCookie("")).toBe("system");
  });

  it("builds a suite-wide cookie in hosted mode", () => {
    expect(themeCookieString("dark", { domain: ".openapphub.org", secure: true })).toBe(
      "oah_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.openapphub.org; Secure",
    );
    expect(themeCookieString("light")).toBe(
      "oah_theme=light; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  it("resolves system from the device", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("applies the dark class", () => {
    mockSystemDark(true);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("the inline script applies the saved cookie before React loads", () => {
    mockSystemDark(false);
    document.cookie = "oah_theme=dark; Path=/";
    new Function(themeInitScript())();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });
});
