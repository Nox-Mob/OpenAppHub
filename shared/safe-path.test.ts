import { describe, expect, it } from "vitest";
import { safePath } from "./safe-path";

describe("safePath", () => {
  it("keeps paths in the suite", () => {
    expect(safePath("/billing")).toBe("/billing");
    expect(safePath("/orgs/1?tab=members#x")).toBe("/orgs/1?tab=members#x");
    expect(safePath("/")).toBe("/");
  });
  it("refuses other sites, scripts and tricks", () => {
    for (const bad of [
      "//evil.example/x",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      " /billing",
      "/bill\ning",
      "",
      null,
      undefined,
      42,
      "/" + "a".repeat(3000),
    ])
      expect(safePath(bad)).toBeNull();
  });
});
