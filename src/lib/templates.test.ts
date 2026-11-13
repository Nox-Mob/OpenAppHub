import { describe, expect, it } from "vitest";
import { designerProblems } from "./designer";
import { TEMPLATES, templateDefinition, templateMissing } from "./templates";
import { FIXTURE_OVERVIEW } from "./workflow-fixture";
import type { Overview } from "./workflows";
// What the suite registers when the hub and all three apps share a database (as on staging):
// regenerate it from a local suite database when an app adds triggers or steps.
import suite from "./suite-overview.fixture.json";

const full = { ...FIXTURE_OVERVIEW, ...(suite as unknown as Partial<Overview>) } as Overview;

describe("workflow templates", () => {
  it("are all ready on the full suite, except those waiting on a feature", () => {
    for (const t of TEMPLATES) {
      if (t.comingWith) expect(templateMissing(t, full)).toEqual([t.comingWith]);
      else expect(templateMissing(t, full), t.id).toEqual([]);
    }
    expect(TEMPLATES.find((t) => t.id === "election_results")?.comingWith).toMatch(/elections/);
  });

  it("pass the designer's checks with only a name to add", () => {
    for (const t of TEMPLATES.filter((x) => !x.comingWith))
      expect(designerProblems(t.name, t.definition, full), t.id).toEqual([]);
  });

  it("say what's missing without the apps they need", () => {
    const hubOnly = {
      ...full,
      triggers: full.triggers.filter((x) => x.app === "hub"),
      actions: [],
      recipients: [],
    };
    const t = TEMPLATES.find((x) => x.id === "loss_warning")!;
    expect(templateMissing(t, hubOnly)).toEqual(
      expect.arrayContaining(["ledger.books_locked", "ledger.month_totals", "board.office"]),
    );
    expect(
      templateMissing(
        TEMPLATES.find((x) => x.id === "renewal_reminders")!,
        hubOnly,
      ),
    ).toEqual(["charter.find_members"]);
  });

  it("hand out copies", () => {
    const t = TEMPLATES[0]!;
    const copy = templateDefinition(t);
    copy.steps.pop();
    expect(t.definition.steps.length).toBeGreaterThan(copy.steps.length);
  });
});
