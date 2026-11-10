import { describe, expect, it } from "vitest";
import { PLANS } from "./pricing";

describe("pricing config", () => {
  it("has the three placeholder plans in order", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["starter", "suite", "plus"]);
  });

  it("keeps prices out of code: they come from Stripe by lookup key", () => {
    for (const p of PLANS) {
      expect(Object.keys(p)).not.toContain("monthlyCents");
      expect(p.features.join(" ")).not.toMatch(/\$\d/);
    }
  });

  it("states limits as editors", () => {
    expect(PLANS.map((p) => p.features.find((f) => /editors/.test(f)))).toEqual([
      "Up to 5 editors",
      "Up to 15 editors",
      "Unlimited editors",
    ]);
  });
});
