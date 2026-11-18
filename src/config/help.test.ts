import { describe, expect, it } from "vitest";
import { HELP } from "./help";

describe("HELP", () => {
  it("links only to hub docs pages, as directory paths", () => {
    // A page (hub/<section>/<page>/) or a section's own overview (hub/<section>/).
    for (const path of Object.values(HELP)) {
      expect(path).toMatch(/^hub\/[a-z-]+\/([a-z-]+\/)?(#[a-z-]+)?$/);
    }
  });
});
