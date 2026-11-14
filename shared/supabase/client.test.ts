import { describe, expect, it } from "vitest";
import { isPlaceholder } from "./client";

describe("isPlaceholder", () => {
  it.each([undefined, "", "PROD_PUBLISHABLE_KEY", "https://STAGING_PROJECT_REF.supabase.co"])(
    "treats %j as not configured",
    (v) => expect(isPlaceholder(v)).toBe(true),
  );
  it.each(["https://abcdefghijklmnop.supabase.co", "sb_publishable_abc123"])("accepts %j", (v) =>
    expect(isPlaceholder(v)).toBe(false),
  );
});

describe("staleCookieDomains", () => {
  it("staging hub: the old .openapphub.org copy and the host-only copy, never the one in use", async () => {
    const { staleCookieDomains } = await import("./client");
    expect(staleCookieDomains("staging.openapphub.org", ".staging.openapphub.org")).toEqual([
      undefined,
      ".openapphub.org",
    ]);
  });
  it("a staging app: every parent except the one in use, never the bare top-level domain", async () => {
    const { staleCookieDomains } = await import("./client");
    const d = staleCookieDomains(
      "staging.charter.staging.openapphub.org",
      ".staging.openapphub.org",
    );
    expect(d).toContain(".openapphub.org");
    expect(d).not.toContain(".staging.openapphub.org");
    expect(d).not.toContain(".org");
  });
  it("production: only host-only copies, the shared domain is the one in use", async () => {
    const { staleCookieDomains } = await import("./client");
    expect(staleCookieDomains("openapphub.org", ".openapphub.org")).toEqual([undefined]);
  });
});

describe("authCookiePrefix", () => {
  it("names this project's cookies only", async () => {
    const { authCookiePrefix } = await import("./client");
    expect(authCookiePrefix("https://abcdefghijklmnop.supabase.co")).toBe(
      "sb-abcdefghijklmnop-auth-token",
    );
  });
});
