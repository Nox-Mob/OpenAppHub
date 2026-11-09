// What each suite app does, for the landing page. Features are taken from each
// app's own README, roadmap and website, and describe what exists today; planned
// work goes in `limits`, not `features`.
import type { SuiteApp } from "@shared/supabase/hosted";

export type AppInfo = {
  id: SuiteApp;
  name: string;
  short: string;
  tagline: string;
  description: string;
  features: { title: string; text: string }[];
  limits: string;
  docsPath: string;
  repo: string;
};

export const APPS: AppInfo[] = [
  {
    id: "charter",
    name: "OpenCharterApp",
    short: "Charter",
    tagline: "Members, chapters and dues",
    description:
      "For associations with a national organization and local chapters, and for single local groups. Each level runs its own members and money, while the national sets the rules.",
    features: [
      {
        title: "National, regions and chapters",
        text: "Settings a national can inherit, override or lock, and a wizard for new chapters.",
      },
      {
        title: "Members and standing",
        text: "Membership levels and terms you define, standing at a glance, and spreadsheet import that's checked before saving.",
      },
      {
        title: "Online joining and renewals",
        text: "Dues paid into each organization's own Stripe account, with numbered receipts.",
      },
      {
        title: "Board seats and roles",
        text: "Required seats and terms from your by-laws; appointments grant the right access automatically.",
      },
      {
        title: "Reports for every level",
        text: "Admins see the numbers for what they manage; members see what they need to do.",
      },
      {
        title: "A full audit trail",
        text: "Every change reads “time, who did what”, with the before and after values.",
      },
    ],
    limits:
      "Automatic email, invoices for postpaid dues, elections and documents are on the roadmap.",
    docsPath: "charter/",
    repo: "https://github.com/Nox-Mob/OpenCharterApp",
  },
  {
    id: "board",
    name: "OpenBoardApp",
    short: "Board",
    tagline: "Meetings, minutes and decisions",
    description:
      "For volunteer boards: prepare, meet, record, approve and follow up, without becoming a governance expert.",
    features: [
      {
        title: "Agendas and board packets",
        text: "Build the agenda, attach documents and assemble the packet as one PDF.",
      },
      {
        title: "Attendance and quorum",
        text: "Track who's present and see quorum live during the meeting.",
      },
      {
        title: "Motions and votes",
        text: "Record movers, seconders, recusals and vote counts against each agenda item, or let members vote live.",
      },
      {
        title: "Official minutes",
        text: "Generate formal minutes on your letterhead, submit them for approval and lock the official version.",
      },
      {
        title: "Action items",
        text: "Assign follow-ups with due dates that stay visible after the meeting.",
      },
      {
        title: "Your full board record",
        text: "Bylaws and policies with versions, an audit log, and a complete export whenever you need it.",
      },
    ],
    limits: "Reminders are on the roadmap.",
    docsPath: "board/",
    repo: "https://github.com/Nox-Mob/OpenBoardApp",
  },
  {
    id: "ledger",
    name: "OpenLedgerApp",
    short: "Ledger",
    tagline: "Budgets and books",
    description:
      "Approachable double-entry accounting for small nonprofits and organizations, with the safeguards of a real ledger.",
    features: [
      {
        title: "Real double-entry",
        text: "Checked by the app and again by the database: every transaction balances.",
      },
      {
        title: "Bank imports you review",
        text: "Imported bank files are evidence only; nothing reaches the ledger until you post it.",
      },
      {
        title: "Reconciliation",
        text: "Match your books to bank statements, line by line.",
      },
      {
        title: "Budgets, projects and funds",
        text: "Track spending against budgets, and tag money for projects, funds and pledges.",
      },
      {
        title: "Reports and closing",
        text: "Standard reports, period close, and exports of everything.",
      },
      {
        title: "Nothing edited in place",
        text: "Posted records are voided and re-entered, so the history stays intact.",
      },
    ],
    limits:
      "Pre-1.0 software: no payroll, tax filing or live bank feeds, and funds are tags rather than full fund accounting. It doesn't give financial advice.",
    docsPath: "ledger/",
    repo: "https://github.com/Nox-Mob/OpenLedgerApp",
  },
];
