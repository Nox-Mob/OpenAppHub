import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openCookieSettings } from "../consent";
import { CookieConsent, CookieTable } from "./CookieConsent";

function reset() {
  cleanup();
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
  sessionStorage.clear();
}
afterEach(reset);

const banner = () => screen.queryByRole("region", { name: "Cookies on OpenAppHub" });

describe("CookieConsent", () => {
  it("asks until the visitor chooses; accept records consent to preferences", () => {
    render(<CookieConsent policyHref="/cookies" />);
    expect(banner()).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cookie policy" }).getAttribute("href")).toBe(
      "/cookies",
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(document.cookie).toMatch(/oah_consent=v1-p1-\d+/);
    expect(banner()).toBeNull();
  });

  it("reject is one click, records no consent and removes preference cookies", () => {
    document.cookie = "oah_theme=dark; Path=/";
    render(<CookieConsent policyHref="/cookies" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject non-essential" }));
    expect(document.cookie).toMatch(/oah_consent=v1-p0-\d+/);
    expect(document.cookie).not.toContain("oah_theme");
    expect(banner()).toBeNull();
  });

  it("does not show again once a choice exists", () => {
    document.cookie = "oah_consent=v1-p0-1762700000; Path=/";
    render(<CookieConsent policyHref="/cookies" />);
    expect(banner()).toBeNull();
  });

  it("settings: required has no switch, preferences start off, choices save", () => {
    render(<CookieConsent policyHref="/cookies" privacyHref="/privacy" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Always on")).toBeTruthy();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(1); // only the optional category can be switched
    expect(switches[0]!.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(switches[0]!);
    expect(switches[0]!.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save my choices" }));
    expect(document.cookie).toMatch(/oah_consent=v1-p1-\d+/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be reopened later and changed; Escape closes without saving", () => {
    document.cookie = "oah_consent=v1-p1-1762700000; Path=/";
    render(<CookieConsent policyHref="/cookies" />);
    act(() => openCookieSettings());
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.cookie).toContain("oah_consent=v1-p1-1762700000");
    act(() => openCookieSettings());
    fireEvent.click(screen.getByRole("button", { name: "Reject non-essential" }));
    expect(document.cookie).toMatch(/oah_consent=v1-p0-\d+/);
  });

  it("the cookie table lists required and optional cookies", () => {
    render(<CookieTable />);
    expect(screen.getByText("oah_org")).toBeTruthy();
    expect(screen.getByText("oah_theme")).toBeTruthy();
    expect(screen.getByText(/only with your permission/)).toBeTruthy();
  });
});
