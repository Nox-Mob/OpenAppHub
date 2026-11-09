import { describe, expect, it } from "vitest";
import { isPlaceholder } from "./client";

describe("isPlaceholder", () => {
  it.each([undefined, "", "PROD_PUBLISHABLE_KEY", "https://STAGING_PROJECT_REF.supabase.co"])(
    "treats %j as not configured",
    (v) => expect(isPlaceholder(v)).toBe(true),
  );
  it.each(["https://abcdefghijklmnop.supabase.co", "sb_publishable_abc123"])("accepts %j", (v) =>
    expect(isPlaceholder(v)).toBe(false),
  );
});
