import { describe, expect, it } from "vitest";
import { MARK_COLORS, MARK_PATHS, markSvg } from "./marks";

const APPS = ["hub", "charter", "board", "ledger"] as const;

describe("suite logos", () => {
  it("every app has a mark and its own tile colour", () => {
    for (const app of APPS) {
      expect(MARK_PATHS[app]).toMatch(/^M/);
      expect(MARK_COLORS[app].tile).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(APPS.map((a) => MARK_COLORS[a].tile)).size).toBe(APPS.length);
  });

  it("the tile has rounded corners, the glyph has no tile, apple-touch is square", () => {
    expect(markSvg("charter")).toContain('rx="14"');
    expect(markSvg("charter", "glyph")).not.toContain("<rect");
    expect(markSvg("charter", "tile", { square: true })).toContain('rx="0"');
  });
});
