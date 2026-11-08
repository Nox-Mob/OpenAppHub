import { describe, expect, it } from "vitest";
import { parseSuiteUrls } from "./hosted";

describe("parseSuiteUrls", () => {
  it("parses known apps and normalises to origins", () => {
    expect(
      parseSuiteUrls(
        "charter=https://charter.openapphub.org/, board=https://board.openapphub.org/x",
      ),
    ).toEqual({
      charter: "https://charter.openapphub.org",
      board: "https://board.openapphub.org",
    });
  });

  it("ignores unknown keys and bad URLs", () => {
    expect(parseSuiteUrls("evil=https://e.example,ledger=not a url")).toEqual({});
    expect(parseSuiteUrls(undefined)).toEqual({});
  });
});
