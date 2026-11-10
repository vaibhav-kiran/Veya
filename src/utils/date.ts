import type { ISODate } from "@/types/models";

/** Local-time `YYYY-MM-DD` (avoids the UTC shift of `toISOString`). */
export function toISODate(date: Date): ISODate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromISODate(value: ISODate): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDays(value: ISODate, days: number): ISODate {
  const date = fromISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export type MonthCursor = { year: number; month: number };

export function monthOf(value: ISODate): MonthCursor {
  const date = fromISODate(value);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth({ year, month }: MonthCursor, delta: number): MonthCursor {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export type CalendarDay = { iso: ISODate; day: number; inMonth: boolean };

/** Six-row (or fewer) Sunday-first grid for the given month, including leading/trailing days. */
export function buildMonthGrid({ year, month }: MonthCursor): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ iso: toISODate(date), day: date.getDate(), inMonth: date.getMonth() === month });
  }
  return weeks;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatMonthYear({ year, month }: MonthCursor): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "Nov 10" */
export function formatShortDate(value: ISODate): string {
  return fromISODate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Monday, November 9" */
export function formatLongDate(value: ISODate): string {
  return fromISODate(value).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Relative label for timestamps in lists: "Today", "Yesterday" or "Nov 10". */
export function formatRelativeDay(timestamp: string): string {
  const iso = toISODate(new Date(timestamp));
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return formatShortDate(iso);
}

export function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
