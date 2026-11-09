import { describe, expect, it } from "vitest";
import { PLANS } from "./pricing";

describe("pricing config", () => {
  it("has the three placeholder plans in order", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["starter", "suite", "plus"]);
  });

  it("shows no prices until the owner confirms them (SHARED-SPEC §6.1)", () => {
    for (const p of PLANS) {
      expect(p.monthlyCents).toBeNull();
      expect(p.yearlyCents).toBeNull();
    }
  });
});
