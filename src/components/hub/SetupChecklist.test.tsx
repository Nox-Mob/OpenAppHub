import { describe, expect, it } from "vitest";
import { setupItems } from "./SetupChecklist";

const fresh = {
  preferences_done: false,
  dismissed: false,
  member_count: 1,
  pending_invitations: 0,
  has_billing_contact: false,
};

describe("setupItems", () => {
  it("starts with only the organization done", () => {
    expect(setupItems(fresh).map((i) => i.done)).toEqual([true, false, false, false]);
  });
  it("counts a pending invitation or a second member as inviting the team", () => {
    expect(setupItems({ ...fresh, pending_invitations: 1 })[2]?.done).toBe(true);
    expect(setupItems({ ...fresh, member_count: 2 })[2]?.done).toBe(true);
  });
  it("is all done with preferences, team and billing contact", () => {
    const all = setupItems({
      ...fresh,
      preferences_done: true,
      member_count: 3,
      has_billing_contact: true,
    });
    expect(all.every((i) => i.done)).toBe(true);
  });
});
