// Security headers set by the Worker's server entry (SHARED-SPEC §10.1).
import { ANALYTICS_CSP } from "@shared/analytics";

export function contentSecurityPolicy(supabaseUrl: string | undefined, analytics = false): string {
  const connect = ["'self'"];
  const script = ["'self'", "'unsafe-inline'"];
  // Cloudflare Web Analytics, production only (shared/analytics.ts).
  if (analytics) {
    script.push(ANALYTICS_CSP.script);
    connect.push(ANALYTICS_CSP.connect);
  }
  if (supabaseUrl) {
    try {
      const { origin, host } = new URL(supabaseUrl);
      connect.push(origin, `wss://${host}`);
    } catch {
      // ignore a malformed URL; the app will show "not configured"
    }
  }
  return [
    "default-src 'self'",
    // TanStack Start streams inline hydration scripts. TODO: switch to nonces.
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function withSecurityHeaders(
  response: Response,
  opts: { supabaseUrl: string | undefined; csp: boolean; analytics?: boolean },
): Response {
  const res = new Response(response.body, response);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  // HTTPS only, for two years, on every subdomain (security review 2026-11-14; browsers ignore it
  // on plain-HTTP development servers).
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  // No camera, microphone, location, payment request or the like: the suite uses none of them.
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (opts.csp)
    res.headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy(opts.supabaseUrl, opts.analytics),
    );
  return res;
}
