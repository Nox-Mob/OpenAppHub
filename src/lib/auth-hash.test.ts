import { describe, expect, it } from "vitest";
import { sessionFromHash } from "./auth-hash";

describe("sessionFromHash", () => {
  it("reads Supabase's invite tokens", () => {
    expect(
      sessionFromHash(
        "#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite",
      ),
    ).toEqual({
      access_token: "a.b.c",
      refresh_token: "r1",
      type: "invite",
    });
  });
  it("ignores fragments without both tokens", () => {
    expect(sessionFromHash("")).toBeNull();
    expect(sessionFromHash("#access_token=a")).toBeNull();
    expect(sessionFromHash("#section-2")).toBeNull();
  });
});
