/**
 * Timezone helpers for deals inventory (Chunk 13).
 * Store UTC; convert operator-local day windows using IANA timezones.
 * Uses Intl only — no extra date library.
 */

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Wall-clock parts of an instant in the given IANA timezone.
 */
export function getZonedParts(isoOrDate: string | Date, timeZone: string): LocalDateParts {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${String(isoOrDate)}`);
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** YYYY-MM-DD in the operator timezone for an instant. */
export function localDateKey(isoOrDate: string | Date, timeZone: string): string {
  const p = getZonedParts(isoOrDate, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Offset (ms) such that: wallClockAsUtcMs - utcMs = offset.
 * I.e. utcMs = wallClockAsUtcMs - offset.
 */
function getTimeZoneOffsetMs(timeZone: string, instant: Date): number {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a local calendar date + time in `timeZone` to a UTC ISO string.
 * @param date YYYY-MM-DD
 * @param time HH:MM or HH:MM:SS (defaults applied by callers)
 */
export function zonedLocalToUtcIso(
  date: string,
  time: string,
  timeZone: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid local date: ${date}`);
  }
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!timeMatch) {
    throw new Error(`Invalid local time: ${time}`);
  }
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const h = Number(timeMatch[1]);
  const mi = Number(timeMatch[2]);
  const s = Number(timeMatch[3] ?? "0");
  if (
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > 31 ||
    h < 0 ||
    h > 23 ||
    mi < 0 ||
    mi > 59 ||
    s < 0 ||
    s > 59
  ) {
    throw new Error(`Invalid local date/time: ${date} ${time}`);
  }

  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let utcMs = wallAsUtc - getTimeZoneOffsetMs(timeZone, new Date(wallAsUtc));
  // Recompute once in case the first guess lands on the other side of a DST boundary.
  const offset2 = getTimeZoneOffsetMs(timeZone, new Date(utcMs));
  utcMs = wallAsUtc - offset2;

  return new Date(utcMs).toISOString();
}

/** Start of local day (00:00:00) in timezone → UTC ISO. */
export function startOfLocalDayUtc(date: string, timeZone: string): string {
  return zonedLocalToUtcIso(date, "00:00:00", timeZone);
}

/** End of local day window default 23:59:00 in timezone → UTC ISO. */
export function endOfLocalDayWindowUtc(date: string, timeZone: string): string {
  return zonedLocalToUtcIso(date, "23:59:00", timeZone);
}
