// @vitest-environment node
// Every shared component must render on the server, where `window` and
// `document` don't exist (SHARED-SPEC §8).
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppShell,
  BillingBanner,
  HelpLink,
  InvitationPage,
  OrgSwitcher,
  SuiteSwitcher,
} from "./index";

const urls = {
  hub: "https://openapphub.org",
  charter: "https://charter.openapphub.org",
  board: "https://board.openapphub.org",
  ledger: "https://ledger.openapphub.org",
};

describe("shared UI renders under SSR", () => {
  it("has no window here", () => {
    expect(typeof window).toBe("undefined");
  });

  it("AppShell", () => {
    const html = renderToString(
      <AppShell
        app="board"
        nav={[
          { label: "Overview", href: "/", current: true },
          { label: "Meetings", href: "/meetings" },
        ]}
        user={{ name: "Mara Rossi", email: "mara@example.org" }}
        orgs={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Riverside Community",
            role: "owner",
          },
        ]}
        currentOrgId="11111111-1111-4111-8111-111111111111"
        billing={{
          plan_id: null,
          status: "trialing",
          apps: [],
          trial_ends_at: "2099-01-01T00:00:00Z",
          current_period_end: null,
          cancel_at_period_end: false,
        }}
        canManageBilling
        billingHref="https://openapphub.org/billing"
        helpHref="https://docs.openapphub.org/board/"
        onSignOut={() => {}}
      >
        <p>Page content</p>
      </AppShell>,
    );
    expect(html).toContain('data-app="board"');
    expect(html).toContain("OpenBoardApp");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Riverside Community");
    expect(html).toContain("Your free trial ends in");
    expect(html).toContain("Page content");
    expect(html).toContain("Skip to content");
  });

  it("SuiteSwitcher, OrgSwitcher, BillingBanner, HelpLink", () => {
    expect(renderToString(<SuiteSwitcher current="ledger" urls={urls} />)).toContain("Switch app");
    expect(renderToString(<SuiteSwitcher current="ledger" urls={{}} />)).toBe("");
    expect(renderToString(<OrgSwitcher orgs={[]} currentOrgId={null} />)).toContain(
      "No organization",
    );
    expect(
      renderToString(<BillingBanner billing={null} app="board" canManage billingHref="/b" />),
    ).toBe("");
    expect(
      renderToString(<HelpLink path="hub/accounts/invitations/">How invitations work</HelpLink>),
    ).toContain("https://docs.openapphub.org/hub/accounts/invitations/");
  });

  it("InvitationPage starts in a loading state", () => {
    const html = renderToString(
      <InvitationPage
        token="abc"
        app="hub"
        client={null}
        signInHref={(n) => `/login?next=${n}`}
        continueHref={() => "/"}
        urls={urls}
      />,
    );
    expect(html).toContain("Checking your invitation");
  });
});
