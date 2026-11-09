import { describe, expect, it } from "vitest";
import { parseSuiteUrls } from "./hosted";

describe("parseSuiteUrls", () => {
  it("parses the JSON object, including the hub, and normalises to origins", () => {
    expect(
      parseSuiteUrls(
        JSON.stringify({
          hub: "https://openapphub.org/",
          charter: "https://charter.openapphub.org/join/x",
          board: "https://board.openapphub.org",
          ledger: "https://ledger.openapphub.org",
        }),
      ),
    ).toEqual({
      hub: "https://openapphub.org",
      charter: "https://charter.openapphub.org",
      board: "https://board.openapphub.org",
      ledger: "https://ledger.openapphub.org",
    });
  });

  it("accepts an already-parsed object", () => {
    expect(parseSuiteUrls({ board: "http://localhost:3002" })).toEqual({
      board: "http://localhost:3002",
    });
  });

  it("ignores unknown keys, bad URLs and non-http schemes", () => {
    expect(
      parseSuiteUrls(
        '{"evil":"https://e.example","ledger":"not a url","board":"javascript:alert(1)","charter":42}',
      ),
    ).toEqual({});
  });

  it.each([
    undefined,
    "",
    "  ",
    "not json",
    "charter=https://charter.openapphub.org",
    "[]",
    "null",
    '"x"',
  ])("returns {} for %j", (raw) => {
    expect(parseSuiteUrls(raw)).toEqual({});
  });
});

describe("cookieDomainFor", () => {
  it("uses the shared domain only on hosts under it, in hosted mode", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("VITE_HOSTED", "true");
    const { cookieDomainFor } = await import("./hosted");
    const d = ".openapphub.org";
    expect(cookieDomainFor("openapphub.org", d)).toBe(d);
    expect(cookieDomainFor("charter.openapphub.org", d)).toBe(d);
    expect(cookieDomainFor("localhost", d)).toBeUndefined();
    expect(cookieDomainFor("openapphub.workers.dev", d)).toBeUndefined();
    expect(cookieDomainFor("evilopenapphub.org", d)).toBeUndefined();
    expect(cookieDomainFor(undefined, d)).toBe(d);
    expect(cookieDomainFor("charter.openapphub.org", "")).toBeUndefined();
    vi.stubEnv("VITE_HOSTED", "false");
    expect(cookieDomainFor("charter.openapphub.org", d)).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
