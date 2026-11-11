import { describe, expect, it } from "vitest";
import { isPreviewOrigin, previewDomains, safeNext } from "./next";

const here = "https://openapphub.org";
const origins = [here, "https://charter.openapphub.org", "https://board.openapphub.org"];

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/billing?x=1", here, origins)).toBe("/billing?x=1");
  });

  it("follows suite origins", () => {
    expect(safeNext("https://charter.openapphub.org/join/abc", here, origins)).toBe(
      "https://charter.openapphub.org/join/abc",
    );
  });

  it("turns absolute same-origin URLs into paths", () => {
    expect(safeNext("https://openapphub.org/settings#x", here, origins)).toBe("/settings#x");
  });

  it.each([
    undefined,
    "",
    "//evil.example/",
    "/\\evil.example",
    "https://evil.example/",
    "https://openapphub.org.evil.example/",
    "https://charter.openapphub.org@evil.example/",
    "https://user:pw@charter.openapphub.org/",
    "javascript:alert(1)",
    "http://charter.openapphub.org/",
    "/\tfoo",
  ])("rejects %s", (value) => {
    expect(safeNext(value, here, origins)).toBe("/");
  });
});

describe("preview origins (staging)", () => {
  const domains = previewDomains(
    "charter.staging.openapphub.org, board.staging.openapphub.org,bad",
  );

  it("parses the list and drops invalid entries", () => {
    expect(domains).toEqual(["charter.staging.openapphub.org", "board.staging.openapphub.org"]);
  });

  it("accepts one branch label under a preview domain", () => {
    expect(isPreviewOrigin("https://staging.charter.staging.openapphub.org", domains)).toBe(true);
    expect(isPreviewOrigin("https://claude-fix-1.board.staging.openapphub.org", domains)).toBe(
      true,
    );
  });

  it("rejects everything else", () => {
    for (const origin of [
      "https://charter.staging.openapphub.org",
      "https://a.b.charter.staging.openapphub.org",
      "http://staging.charter.staging.openapphub.org",
      "https://staging.charter.staging.openapphub.org:8443",
      "https://evilcharter.staging.openapphub.org",
      "https://staging.charter.staging.openapphub.org.evil.com",
      "https://staging.ledger.staging.openapphub.org",
    ]) {
      expect(isPreviewOrigin(origin, domains), origin).toBe(false);
    }
  });

  it("lets sign-in return to a preview, keeping the path", () => {
    const next = "https://staging.board.staging.openapphub.org/meetings?x=1";
    expect(safeNext(next, "https://staging.openapphub.org", [], domains)).toBe(next);
    expect(safeNext("https://evil.example/", "https://staging.openapphub.org", [], domains)).toBe(
      "/",
    );
  });

  it("is off without preview domains (production)", () => {
    const next = "https://staging.board.staging.openapphub.org/";
    expect(safeNext(next, "https://openapphub.org", [], [])).toBe("/");
  });
});
