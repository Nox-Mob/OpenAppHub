import { describe, expect, it } from "vitest";
import { crossSiteWrite } from "./cross-site";

const req = (method: string, site?: string) =>
  new Request("https://openapphub.org/_serverFn/x", {
    method,
    headers: site ? { "sec-fetch-site": site } : {},
  });

describe("crossSiteWrite", () => {
  it("refuses a POST another site's page sent", () => {
    expect(crossSiteWrite(req("POST", "cross-site"))).toBe(true);
  });
  it("allows the suite's own pages and subdomains", () => {
    expect(crossSiteWrite(req("POST", "same-origin"))).toBe(false);
    expect(crossSiteWrite(req("POST", "same-site"))).toBe(false);
  });
  it("allows servers that send no header (Stripe, mail systems)", () => {
    expect(crossSiteWrite(req("POST"))).toBe(false);
  });
  it("leaves reads alone, so links from other sites still open pages", () => {
    expect(crossSiteWrite(req("GET", "cross-site"))).toBe(false);
  });
});
