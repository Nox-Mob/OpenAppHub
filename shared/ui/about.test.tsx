import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AboutLicenses, filterPackages, licenseCounts, type ThirdPartyPackage } from "./About";

const pkgs: ThirdPartyPackage[] = [
  { name: "react", version: "19.3.1", license: "MIT", url: "https://react.dev" },
  { name: "zod", version: "4.6.7", license: "MIT", url: "https://zod.dev" },
  { name: "lucide-react", version: "1.70.0", license: "ISC", url: "https://lucide.dev" },
  {
    name: "buffers",
    version: "0.1.1",
    license: "UNKNOWN",
    url: "https://www.npmjs.com/package/buffers",
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("filterPackages", () => {
  it("matches every word against the name and license", () => {
    expect(filterPackages(pkgs, "").length).toBe(4);
    expect(filterPackages(pkgs, "react").map((p) => p.name)).toEqual(["react", "lucide-react"]);
    expect(filterPackages(pkgs, "react isc").map((p) => p.name)).toEqual(["lucide-react"]);
    expect(filterPackages(pkgs, "  MIT ").length).toBe(2);
  });
});

describe("licenseCounts", () => {
  it("counts licenses, most used first", () => {
    expect(licenseCounts(pkgs)).toEqual([
      ["MIT", 2],
      ["ISC", 1],
      ["UNKNOWN", 1],
    ]);
  });
});

describe("AboutLicenses", () => {
  it("lists the services and the packages, and searches them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ packages: pkgs }), { status: 200 })),
    );
    render(<AboutLicenses appName="OpenBoardApp" />);
    expect(screen.getByRole("link", { name: "Supabase" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "zod" })).toBeTruthy();
    expect(screen.getByText("Not stated by the package")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "the license file" })[0]?.getAttribute("href")).toBe(
      "/third-party-licenses.txt",
    );
    fireEvent.change(screen.getByLabelText("Search packages"), { target: { value: "isc" } });
    expect(screen.queryByRole("link", { name: "zod" })).toBeNull();
    expect(screen.getByRole("link", { name: "lucide-react" })).toBeTruthy();
  });

  it("points to the license file when the list doesn't load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    render(<AboutLicenses appName="OpenLedgerApp" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
