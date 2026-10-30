import { addDays, isoDate, isValidDate, MONTHS } from "../time.ts";
import type { IsoDate } from "../types.ts";

export type DateResult = { ok: true; date: IsoDate } | { ok: false; reason: "invalid" | "future" };

/**
 * Accepts "today", "yesterday", "1 oct", "1st October", "oct 1", "01/10", "1/10/2026".
 * Day comes before month (Nigerian style). Without a year, picks the most
 * recent such date that isn't in the future. Future dates are rejected.
 */
export function parseDate(input: string, today: IsoDate): DateResult {
  const t = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "");
  if (t === "today") return { ok: true, date: today };
  if (t === "yesterday") return { ok: true, date: addDays(today, -1) };

  let day: number, month: number, year: number | undefined;
  let m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/);
  const named = m ?? t.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (named) {
    const [dayStr, monthStr] = m ? [named[1], named[2]] : [named[2], named[1]];
    const idx = MONTHS.indexOf(monthStr.slice(0, 3));
    if (idx < 0 || monthStr.length < 3) return { ok: false, reason: "invalid" };
    day = Number(dayStr);
    month = idx + 1;
    year = named[3] ? Number(named[3]) : undefined;
  } else if ((m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?$/))) {
    day = Number(m[1]);
    month = Number(m[2]);
    year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
  } else {
    return { ok: false, reason: "invalid" };
  }

  const thisYear = Number(today.slice(0, 4));
  if (year === undefined) {
    year = thisYear;
    if (!isValidDate(year, month, day)) return { ok: false, reason: "invalid" };
    if (isoDate(year, month, day) > today) year -= 1;
  }
  if (!isValidDate(year, month, day)) return { ok: false, reason: "invalid" };
  const date = isoDate(year, month, day);
  if (date > today) return { ok: false, reason: "future" };
  return { ok: true, date };
}
