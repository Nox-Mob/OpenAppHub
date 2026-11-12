import { describe, expect, it } from "vitest";
import { boardRole, ledgerRole } from "./people";

describe("people across the apps (H-04)", () => {
  it("names each person's role in OpenBoardApp", () => {
    expect(boardRole("owner", "chair")).toBe("Owner");
    expect(boardRole("member", "secretary")).toBe("Secretary");
    expect(boardRole("member", undefined)).toBe("Board member");
    expect(boardRole("viewer", undefined)).toBe("Observer");
  });
  it("names each person's role in OpenLedgerApp", () => {
    expect(ledgerRole("owner", undefined)).toBe("Admin");
    expect(ledgerRole("member", "treasurer")).toBe("Treasurer");
    expect(ledgerRole("member", undefined)).toBe("Member");
    expect(ledgerRole("viewer", "treasurer")).toBe("View only");
  });
});
