import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AboutLicenses, filterLibraries, licenseTextsUrl, type Library } from "./About";

const libs: Library[] = [
  { name: "react", license: "MIT" },
  { name: "zod", license: "MIT" },
  { name: "lucide-react", license: "ISC" },
  { name: "serde", license: "MIT OR Apache-2.0" },
];

describe("filterLibraries", () => {
  it("matches every word against the name and license", () => {
    expect(filterLibraries(libs, "").length).toBe(4);
    expect(filterLibraries(libs, "react").map((l) => l.name)).toEqual(["react", "lucide-react"]);
    expect(filterLibraries(libs, "react isc").map((l) => l.name)).toEqual(["lucide-react"]);
    expect(filterLibraries(libs, "apache").map((l) => l.name)).toEqual(["serde"]);
  });
});

describe("AboutLicenses", () => {
  it("shows each library and its license, and searches them", () => {
    render(<AboutLicenses libraries={libs} />);
    expect(screen.getByText(/used within the OpenAppHub suite/)).toBeTruthy();
    expect(screen.getByRole("cell", { name: "zod" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "the license file" }).getAttribute("href")).toBe(
      licenseTextsUrl(),
    );
    fireEvent.change(screen.getByLabelText("Search libraries"), { target: { value: "isc" } });
    expect(screen.queryByRole("cell", { name: "zod" })).toBeNull();
    expect(screen.getByRole("cell", { name: "lucide-react" })).toBeTruthy();
  });
  it("adds a second license file when an edition ships more", () => {
    render(
      <AboutLicenses
        libraries={libs}
        moreTexts={{ href: "/third-party-licenses-rust.txt", label: "the desktop license file" }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "the desktop license file" }).getAttribute("href"),
    ).toBe("/third-party-licenses-rust.txt");
  });
  it("links to the full license texts on the hub", () => {
    expect(licenseTextsUrl()).toMatch(/^https?:\/\/.+\/third-party-licenses\.txt$/);
  });
});
