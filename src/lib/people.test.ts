import { describe, expect, it } from "vitest";
import { appRoleOf, boardRole, ledgerRole } from "./people";

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

  it("gives each app its own role, the owner being the owner everywhere", () => {
    const o = new Map([
      ["board:u1", "admin" as const],
      ["ledger:u1", "viewer" as const],
    ]);
    expect(appRoleOf("member", "board", "u1", o)).toBe("admin");
    expect(appRoleOf("member", "ledger", "u1", o)).toBe("viewer");
    expect(appRoleOf("member", "charter", "u1", o)).toBe("member");
    expect(appRoleOf("owner", "ledger", "u1", o)).toBe("owner");
  });
});
