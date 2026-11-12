import { describe, expect, it, vi } from "vitest";
import { pokeApps, runAutomationJobs, signRun, verifyRun } from "./run";

describe("automation jobs", () => {
  it("signs and checks a run request", async () => {
    const h = new Headers(await signRun("service-key", "ledger", 1_700_000_000_000));
    expect(await verifyRun("service-key", "ledger", h, 1_700_000_100_000)).toBe(true);
    expect(await verifyRun("other-key", "ledger", h, 1_700_000_100_000)).toBe(false);
    expect(await verifyRun("service-key", "board", h, 1_700_000_100_000)).toBe(false);
    expect(await verifyRun("service-key", "ledger", h, 1_700_001_000_000)).toBe(false);
    expect(await verifyRun("", "ledger", h, 1_700_000_100_000)).toBe(false);
  });

  it("runs each claimed job with its handler and records the outcome", async () => {
    const calls: Array<[string, unknown]> = [];
    const rpc = vi.fn(async (fn: string, args: unknown) => {
      calls.push([fn, args]);
      if (fn === "claim_automation_jobs")
        return {
          data: [
            {
              id: 1,
              org_id: "o",
              run_id: 9,
              app: "ledger",
              kind: "ledger.reports_to_meeting",
              payload: {},
              attempts: 1,
            },
            {
              id: 2,
              org_id: "o",
              run_id: 9,
              app: "ledger",
              kind: "ledger.unknown",
              payload: {},
              attempts: 1,
            },
          ],
          error: null,
        };
      return { data: null, error: null };
    });
    const admin = { schema: () => ({ rpc }) } as never;
    const r = await runAutomationJobs(admin, "ledger", {
      "ledger.reports_to_meeting": async () => ({ summary: "added" }),
    });
    expect(r).toEqual({ done: 1, failed: 1 });
    expect(calls).toContainEqual([
      "finish_automation_job",
      { p_id: 1, p_ok: true, p_result: { summary: "added" }, p_error: null },
    ]);
    expect(
      calls.find(
        (c) => c[0] === "finish_automation_job" && (c[1] as { p_id: number }).p_id === 2,
      )?.[1],
    ).toMatchObject({
      p_ok: false,
      p_error: 'This app can\'t do "ledger.unknown".',
    });
  });

  it("asks only apps with queued jobs", async () => {
    const select = {
      in: () => ({
        limit: async () => ({
          data: [{ app: "ledger" }, { app: "ledger" }, { app: "hub" }],
          error: null,
        }),
      }),
    };
    const admin = { schema: () => ({ from: () => ({ select: () => select }) }) } as never;
    const fetcher = vi.fn(async () => new Response("ok"));
    const apps = await pokeApps(
      admin,
      { ledger: "https://ledger.example/" },
      "k",
      fetcher as never,
    );
    expect(apps).toEqual(["ledger"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://ledger.example/automation/run",
    );
  });
});
