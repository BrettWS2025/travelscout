export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type WeatherIconKind =
  | "clear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

export type DailyWeather = {
  date: string;
  weatherCode: number;
  icon: WeatherIconKind;
  description: string;
  tempMax: number | null;
  tempMin: number | null;
};

const FORECAST_PAST_DAYS = 92;
/** Open-Meteo `forecast_days=16` includes today, so the last day is today + 15. */
const FORECAST_FUTURE_DAYS = 15;
export const MAX_WEATHER_RANGE_DAYS = 120;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function utcIsoDate(d = new Date()): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcIsoDate(d);
}

export function daysInclusive(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

/**
 * Forecast API covers roughly the last 92 days through 16 days ahead.
 * Clamp the requested range into that window; return null if there is no overlap.
 */
export function clampToForecastWindow(
  startDate: string,
  endDate: string,
  today = utcIsoDate()
): { startDate: string; endDate: string } | null {
  const min = addDaysToIsoDate(today, -FORECAST_PAST_DAYS);
  const max = addDaysToIsoDate(today, FORECAST_FUTURE_DAYS);
  const clampedStart = startDate < min ? min : startDate;
  const clampedEnd = endDate > max ? max : endDate;
  if (clampedStart > clampedEnd) return null;
  return { startDate: clampedStart, endDate: clampedEnd };
}

export function intersectDateRanges(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string }
): { startDate: string; endDate: string } | null {
  const startDate = a.startDate > b.startDate ? a.startDate : b.startDate;
  const endDate = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

/** Parse Open-Meteo messages like: "out of allowed range from 2026-06-05 to 2026-09-21" */
export function parseOpenMeteoAllowedRange(reason: string): { startDate: string; endDate: string } | null {
  const match = reason.match(/from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return { startDate: match[1], endDate: match[2] };
}

export function weatherCodeToMeta(code: number): {
  icon: WeatherIconKind;
  description: string;
} {
  if (code === 0) return { icon: "clear", description: "Clear sky" };
  if (code === 1) return { icon: "partlyCloudy", description: "Mainly clear" };
  if (code === 2) return { icon: "partlyCloudy", description: "Partly cloudy" };
  if (code === 3) return { icon: "overcast", description: "Overcast" };
  if (code === 45 || code === 48) return { icon: "fog", description: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "drizzle", description: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { icon: "rain", description: "Rain" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { icon: "snow", description: "Snow" };
  }
  if (code >= 95 && code <= 99) return { icon: "thunderstorm", description: "Thunderstorm" };
  return { icon: "overcast", description: "Cloudy" };
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** High / low, e.g. "18° / 7°". Returns null when either bound is missing. */
export function formatForecastTemps(
  tempMax: number | null | undefined,
  tempMin: number | null | undefined
): string | null {
  if (tempMax == null || tempMin == null) return null;
  if (!Number.isFinite(tempMax) || !Number.isFinite(tempMin)) return null;
  return `${Math.round(tempMax)}° / ${Math.round(tempMin)}°`;
}

export function buildDailyWeatherByDate(
  times: unknown,
  codes: unknown,
  maxTemps?: unknown,
  minTemps?: unknown
): Record<string, DailyWeather> {
  if (!Array.isArray(times) || !Array.isArray(codes)) return {};

  const maxArr = Array.isArray(maxTemps) ? maxTemps : [];
  const minArr = Array.isArray(minTemps) ? minTemps : [];

  const byDate: Record<string, DailyWeather> = {};
  for (let i = 0; i < times.length; i++) {
    const date = times[i];
    const rawCode = codes[i];
    if (typeof date !== "string" || !isIsoDate(date)) continue;
    if (rawCode === null || rawCode === undefined || rawCode === "") continue;
    const weatherCode = typeof rawCode === "number" ? rawCode : Number(rawCode);
    if (!Number.isFinite(weatherCode)) continue;
    const meta = weatherCodeToMeta(weatherCode);
    byDate[date] = {
      date,
      weatherCode,
      icon: meta.icon,
      description: meta.description,
      tempMax: parseOptionalNumber(maxArr[i]),
      tempMin: parseOptionalNumber(minArr[i]),
    };
  }
  return byDate;
}
