import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatDateISO, formatMoney } from "./format";

describe("formatMoney", () => {
  it.each([
    [123456, "$1,234.56"],
    [-123456, "-$1,234.56"],
    [0, "$0.00"],
    [5, "$0.05"],
    [100000000, "$1,000,000.00"],
    [123456n, "$1,234.56"],
    [-0, "$0.00"],
  ])("%s → %s", (cents, out) => {
    expect(formatMoney(cents)).toBe(out);
  });

  it("shows a plus sign when asked", () => {
    expect(formatMoney(5000, { sign: true })).toBe("+$50.00");
    expect(formatMoney(-5000, { sign: true })).toBe("-$50.00");
    expect(formatMoney(0, { sign: true })).toBe("$0.00");
  });

  it("uses the org's currency", () => {
    expect(formatMoney(123456, { currency: "EUR" })).toBe("€1,234.56");
    expect(formatMoney(123456, { currency: "CAD" })).toBe("CA$1,234.56");
  });

  it("rejects non-numbers", () => {
    expect(() => formatMoney(Number.NaN)).toThrow();
  });
});

describe("formatAmount", () => {
  it("is a plain decimal for exports", () => {
    expect(formatAmount(123456)).toBe("1234.56");
    expect(formatAmount(-5)).toBe("-0.05");
    expect(formatAmount(0)).toBe("0.00");
  });
});

describe("formatDate", () => {
  const ts = "2026-11-09T19:30:00Z";

  it("formats in the org's time zone", () => {
    expect(formatDate(ts, { timeZone: "America/Toronto" })).toBe("Nov 9, 2026");
    expect(formatDate(ts, { time: true, timeZone: "America/Toronto" })).toBe(
      "Nov 9, 2026, 2:30 PM",
    );
    expect(formatDate(ts, { time: true, timeZone: "Asia/Tokyo" })).toBe("Nov 10, 2026, 4:30 AM");
  });

  it("never shifts calendar dates", () => {
    expect(formatDate("2026-11-09", { timeZone: "America/Los_Angeles" })).toBe("Nov 9, 2026");
    expect(formatDate("2026-11-09", { time: true, timeZone: "Pacific/Auckland" })).toBe(
      "Nov 9, 2026",
    );
  });

  it("accepts Date and epoch ms", () => {
    expect(formatDate(new Date(ts), { timeZone: "UTC" })).toBe("Nov 9, 2026");
    expect(formatDate(Date.parse(ts), { timeZone: "UTC" })).toBe("Nov 9, 2026");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not a date")).toThrow();
  });
});

describe("formatDateISO", () => {
  it("is YYYY-MM-DD in the given zone", () => {
    expect(formatDateISO("2026-11-09T23:30:00Z", { timeZone: "UTC" })).toBe("2026-11-09");
    expect(formatDateISO("2026-11-09T23:30:00Z", { timeZone: "Asia/Tokyo" })).toBe("2026-11-10");
    expect(formatDateISO("2026-11-09")).toBe("2026-11-09");
  });
});
