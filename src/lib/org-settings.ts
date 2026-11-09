import { formatDate, formatMoney } from "@shared/format";

// Helpers for the organization and account settings screens.

/** Currencies offered in Settings (ISO 4217). The database accepts any 3-letter code. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "JPY", name: "Japanese yen" },
  { code: "MXN", name: "Mexican peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "INR", name: "Indian rupee" },
  { code: "ZAR", name: "South African rand" },
];

const FALLBACK_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Halifax",
  "America/St_Johns",
  "America/Toronto",
  "America/Vancouver",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Regina",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Africa/Johannesburg",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

/** IANA time zones for the picker: UTC first, then the runtime's list (or a short fallback). */
export function timeZones(current?: string): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const list = intl.supportedValuesOf?.("timeZone");
    if (list && list.length > 0) zones = list;
  } catch {
    // older runtime: keep the fallback list
  }
  const all = new Set(["UTC", ...[...zones].sort()]);
  if (current) all.add(current);
  return [...all];
}

export type TransferCandidate = {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
};

/** What the owner types to confirm a transfer: the member's name, or their email without one. */
export function confirmTextFor(c: Pick<TransferCandidate, "display_name" | "email">): string {
  return c.display_name?.trim() || c.email;
}

/** Same rule as the database: ignore case and surrounding spaces. */
export function confirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim() !== "";
}

/** Light check before sending to the database (which validates again). */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

const EURO_REGIONS = new Set(
  "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" "),
);
const REGION_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  JP: "JPY",
  MX: "MXN",
  BR: "BRL",
  IN: "INR",
  ZA: "ZAR",
};

/** A starting guess for the org's currency from the browser's language ("en-CA" → CAD). */
export function guessCurrency(locale: string | undefined): string {
  const region = locale?.match(/[-_]([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
  if (!region) return "USD";
  if (EURO_REGIONS.has(region)) return "EUR";
  return REGION_CURRENCY[region] ?? "USD";
}

/** The browser's time zone, or UTC. */
export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "Nov 9, 2026, 2:47 AM · CA$1,234.56", or "" for an unknown zone or currency. */
export function formatPreview(timeZone: string, currency: string, now = new Date()): string {
  try {
    return `${formatDate(now, { time: true, timeZone })} · ${formatMoney(123456, { currency })}`;
  } catch {
    return "";
  }
}
