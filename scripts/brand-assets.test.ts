import { describe, expect, it } from "vitest";
import { ico } from "./brand-assets";

describe("favicon.ico", () => {
  it("lists each PNG with its size and where it starts", () => {
    const a = Buffer.from("aaaa");
    const b = Buffer.from("bbbbbb");
    const out = ico([
      { size: 16, data: a },
      { size: 256, data: b },
    ]);
    expect(out.readUInt16LE(2)).toBe(1);
    expect(out.readUInt16LE(4)).toBe(2);
    expect(out.readUInt8(6)).toBe(16);
    expect(out.readUInt8(22)).toBe(0); // 256 is written as 0
    expect(out.readUInt32LE(6 + 12)).toBe(6 + 32);
    expect(out.readUInt32LE(22 + 12)).toBe(6 + 32 + a.length);
    expect(out.subarray(6 + 32).toString()).toBe("aaaabbbbbb");
  });
});
