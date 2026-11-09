import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

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
