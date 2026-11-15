import { describe, expect, it } from "vitest";
import { analyticsScripts, analyticsToken } from "./analytics";

describe("analytics (production only)", () => {
  it("is off without a token, or with anything that isn't one", () => {
    expect(analyticsToken(undefined)).toBeNull();
    expect(analyticsToken("")).toBeNull();
    expect(analyticsToken('x"><script>')).toBeNull();
    expect(analyticsScripts(null)).toEqual([]);
  });
  it("adds Cloudflare's beacon with the token", () => {
    const t = "054d7738b858425f863060e1c3b9dbb3";
    expect(analyticsToken(t)).toBe(t);
    expect(analyticsScripts(t)).toEqual([
      {
        src: "https://static.cloudflareinsights.com/beacon.min.js",
        defer: true,
        "data-cf-beacon": `{"token":"${t}"}`,
      },
    ]);
  });
});
