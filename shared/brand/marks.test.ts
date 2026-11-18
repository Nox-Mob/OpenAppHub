import { describe, expect, it } from "vitest";
import { markSvg } from "./marks";

describe("suite logos", () => {
  it("the tile has rounded corners, the glyph has no tile, apple-touch is square", () => {
    expect(markSvg("charter")).toContain('rx="14"');
    expect(markSvg("charter", "glyph")).not.toContain("<rect");
    expect(markSvg("charter", "tile", { square: true })).toContain('rx="0"');
  });
});
