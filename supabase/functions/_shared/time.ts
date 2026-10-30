// Lagos time helpers. Nigeria is UTC+1 all year (no daylight saving), so a
// fixed offset is exact and keeps everything testable.
import type { IsoDate } from "./types.ts";

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function lagosDate(at: Date | string): IsoDate {
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  return new Date(t + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10" — the key for the usage table. */
export function lagosMonthKey(at: Date): string {
  return lagosDate(at).slice(0, 7);
}

/** Midday Lagos time on a date, as a UTC timestamp (used for backdated payments). */
export function lagosNoon(date: IsoDate): string {
  return new Date(Date.parse(`${date}T12:00:00+01:00`)).toISOString();
}

/** Start of a Lagos date (00:00), as a UTC timestamp. */
export function lagosStartOf(date: IsoDate): string {
  return new Date(Date.parse(`${date}T00:00:00+01:00`)).toISOString();
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Whole months from `from` to `to`, anchored on the day of month. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

export function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isoDate(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Monday of the week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  const dow = new Date(Date.parse(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function monthStart(date: IsoDate): IsoDate {
  return `${date.slice(0, 8)}01`;
}

/** "2 Oct" */
export function shortDate(date: IsoDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTH_LABELS[m - 1]}`;
}

/** "Mon 27 Oct" */
export function dayLabel(date: IsoDate): string {
  return `${WEEKDAYS[new Date(Date.parse(date)).getUTCDay()]} ${shortDate(date)}`;
}

/** "1 Nov" — the day the monthly reply budget resets. */
export function nextMonthLabel(at: Date): string {
  const [y, m] = lagosMonthKey(at).split("-").map(Number);
  return `1 ${MONTH_LABELS[m % 12]}${m === 12 ? ` ${y + 1}` : ""}`;
}
