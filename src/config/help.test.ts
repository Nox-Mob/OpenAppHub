import { describe, expect, it } from "vitest";
import { HELP } from "./help";

describe("HELP", () => {
  it("links only to hub docs pages, as directory paths", () => {
    // A page (hub/<section>/<page>/) or a section's own overview (hub/<section>/).
    for (const path of Object.values(HELP)) {
      expect(path).toMatch(/^hub\/[a-z-]+\/([a-z-]+\/)?(#[a-z-]+)?$/);
    }
  });
  it("sends the Automations page to the Automations section", () => {
    expect(HELP.automations).toBe("hub/automations/");
  });
  it("matches AGENTS step 22", () => {
    expect(HELP.signIn).toBe("hub/accounts/signing-in/");
    expect(HELP.members).toBe("hub/accounts/invitations/");
    expect(HELP.orgSettings).toBe("hub/accounts/organizations-and-roles/");
    expect(HELP.billing).toBe("hub/hosting/hosted-vs-self-hosted/");
    expect(HELP.export).toBe("hub/data/ownership-and-export/");
  });
});
