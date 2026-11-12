import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addReportToBoardMeeting, upcomingBoardMeetings } from "./board";
import { isMissing } from "./detect";

function fakeClient(result: { data: unknown; error: unknown }, calls: string[] = []) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit"])
    chain[m] = (...a: unknown[]) => (calls.push(`${m}:${JSON.stringify(a)}`), chain);
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve(result);
  return {
    schema: (s: string) => (
      calls.push(`schema:${s}`),
      {
        from: () => chain,
        rpc: (fn: string, args: unknown) => (
          calls.push(`rpc:${fn}:${JSON.stringify(args)}`),
          Promise.resolve(result)
        ),
      }
    ),
    storage: {
      from: (b: string) => ({
        upload: (path: string) => (
          calls.push(`upload:${b}:${path}`),
          Promise.resolve({ error: null })
        ),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("cross-app integrations (S-12, S-13)", () => {
  it("knows when another app isn't on this database", () => {
    expect(isMissing({ code: "42P01" })).toBe(true);
    expect(isMissing({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissing({ message: "permission denied" })).toBe(false);
    expect(isMissing(null)).toBe(false);
  });

  it("lists upcoming Board meetings, or null without OpenBoardApp", async () => {
    const calls: string[] = [];
    const rows = [{ id: "m1", title: "December", meeting_date: "2026-12-10" }];
    expect(
      await upcomingBoardMeetings(
        fakeClient({ data: rows, error: null }, calls),
        "org",
        "2026-11-12",
      ),
    ).toEqual(rows);
    expect(calls).toContain('gte:["meeting_date","2026-11-12"]');
    expect(
      await upcomingBoardMeetings(fakeClient({ data: null, error: { code: "42P01" } }), "org"),
    ).toBeNull();
  });

  it("adds a report through Board's RPC, then uploads the PDF to the path it returns", async () => {
    const calls: string[] = [];
    const client = fakeClient(
      { data: [{ document_id: "d1", storage_path: "org/documents/d1/v1-r.pdf" }], error: null },
      calls,
    );
    const id = await addReportToBoardMeeting(client, {
      meetingId: "m1",
      title: "Report",
      fileName: "r.pdf",
      pdf: new Blob(["%PDF"]),
      sourceApp: "ledger",
    });
    expect(id).toBe("d1");
    expect(
      calls.some(
        (c) => c.startsWith("rpc:add_report_to_meeting") && c.includes('"p_source_app":"ledger"'),
      ),
    ).toBe(true);
    expect(calls).toContain("upload:board-files:org/documents/d1/v1-r.pdf");
  });

  it("explains who may add reports when Board refuses", async () => {
    const client = fakeClient({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    await expect(
      addReportToBoardMeeting(client, {
        meetingId: "m1",
        title: "R",
        fileName: "r.pdf",
        pdf: new Blob([]),
        sourceApp: "charter",
      }),
    ).rejects.toThrow(/owner, admin, chair or secretary/);
  });
});
