import { describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, withSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("allows the Supabase origin and websocket", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets the fixed headers", () => {
    const res = withSecurityHeaders(new Response("ok"), { supabaseUrl: undefined, csp: true });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(res.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });
});

describe("Cloudflare Web Analytics in the CSP (production only)", () => {
  it("isn't allowed without the production token", () => {
    vi.stubEnv("VITE_CF_ANALYTICS_TOKEN", "");
    expect(contentSecurityPolicy("https://abc.supabase.co")).not.toContain("cloudflareinsights");
    vi.unstubAllEnvs();
  });
  it("allows only the beacon script and its reporting endpoint with the token", () => {
    vi.stubEnv("VITE_CF_ANALYTICS_TOKEN", "054d7738b858425f863060e1c3b9dbb3");
    const csp = contentSecurityPolicy("https://abc.supabase.co", true);
    expect(csp).toMatch(/script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/cloudflareinsights\.com/);
    vi.unstubAllEnvs();
  });
});
