import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  confirmTextFor,
  confirmationMatches,
  looksLikeEmail,
  timeZones,
} from "./org-settings";

describe("transfer confirmation", () => {
  it("uses the name, or the email when there is none", () => {
    expect(confirmTextFor({ display_name: " Bob Tremblay ", email: "bob@x.org" })).toBe(
      "Bob Tremblay",
    );
    expect(confirmTextFor({ display_name: "  ", email: "bob@x.org" })).toBe("bob@x.org");
    expect(confirmTextFor({ display_name: null, email: "bob@x.org" })).toBe("bob@x.org");
  });
  it("ignores case and surrounding spaces only", () => {
    expect(confirmationMatches("  bob tremblay ", "Bob Tremblay")).toBe(true);
    expect(confirmationMatches("bob", "Bob Tremblay")).toBe(false);
    expect(confirmationMatches("bobtremblay", "Bob Tremblay")).toBe(false);
    expect(confirmationMatches("", "")).toBe(false);
  });
});

describe("options", () => {
  it("lists UTC first and keeps the current zone", () => {
    const zones = timeZones("Etc/GMT+5");
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("America/Toronto");
    expect(zones).toContain("Etc/GMT+5");
    expect(new Set(zones).size).toBe(zones.length);
  });
  it("has unique 3-letter currencies", () => {
    expect(CURRENCIES.every((c) => /^[A-Z]{3}$/.test(c.code))).toBe(true);
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
  });
  it("checks email shape", () => {
    expect(looksLikeEmail(" billing@riverside.org ")).toBe(true);
    expect(looksLikeEmail("billing@riverside")).toBe(false);
  });
});
