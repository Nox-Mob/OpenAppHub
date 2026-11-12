import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DigestFields,
  describeDigest,
  digestIncomplete,
  hourLabel,
  type DigestPrefs,
} from "./DigestSettings";

afterEach(cleanup);

const base: DigestPrefs = {
  digest: "weekly",
  day: 1,
  hour: 7,
  timeZone: "America/New_York",
  orgIds: null,
  include: ["tasks", "meetings"],
  orgs: [
    { id: "a", name: "Lakeview" },
    { id: "b", name: "Pinecrest" },
  ],
  detailed: true,
};

function Harness({ start }: { start: DigestPrefs }) {
  const [v, setV] = useState(start);
  return (
    <>
      <DigestFields value={v} onChange={setV} />
      <output data-testid="state">{JSON.stringify(v)}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as DigestPrefs;

describe("digest settings", () => {
  it("labels hours and says what the choice means", () => {
    expect(hourLabel(0)).toBe("12:00 AM");
    expect(hourLabel(7)).toBe("7:00 AM");
    expect(hourLabel(12)).toBe("12:00 PM");
    expect(hourLabel(18)).toBe("6:00 PM");
    expect(describeDigest(base)).toBe("Every Monday at about 7:00 AM (America/New York).");
    expect(describeDigest({ ...base, digest: "daily", hour: 18 })).toBe(
      "Every day at about 6:00 PM (America/New York).",
    );
    expect(describeDigest({ ...base, digest: "off" })).toBe("No task summary emails.");
  });

  it("can't be saved with nothing included or no organization", () => {
    expect(digestIncomplete(base)).toBe(false);
    expect(digestIncomplete({ ...base, include: [] })).toBe(true);
    expect(digestIncomplete({ ...base, orgIds: [] })).toBe(true);
    expect(digestIncomplete({ ...base, digest: "off", include: [] })).toBe(false);
  });

  it("shows day only for weekly and hides details when off", () => {
    render(<Harness start={base} />);
    expect(screen.getByLabelText("Day")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "daily" } });
    expect(screen.queryByLabelText("Day")).toBeNull();
    expect(screen.getByLabelText("Time")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "off" } });
    expect(screen.queryByLabelText("Time")).toBeNull();
    expect(screen.getByText("No task summary emails.")).toBeTruthy();
  });

  it("narrows to chosen organizations, and back to all", () => {
    render(<Harness start={base} />);
    fireEvent.click(screen.getByLabelText("Pinecrest"));
    expect(state().orgIds).toEqual(["a"]);
    fireEvent.click(screen.getByLabelText("Pinecrest"));
    expect(state().orgIds).toBeNull();
    fireEvent.click(screen.getByLabelText("Upcoming board meetings"));
    expect(state().include).toEqual(["tasks"]);
  });

  it("shows only the frequency before core 0007", () => {
    render(<Harness start={{ ...base, detailed: false }} />);
    expect(screen.queryByLabelText("Time")).toBeNull();
    expect(screen.getByText("Every Monday in the morning.")).toBeTruthy();
  });
});
