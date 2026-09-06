import { NextResponse } from "next/server";
import crypto from "crypto";
import { getRedisClient } from "@/lib/redis/client";
import { enforceBffRateLimit } from "@/lib/bff-rate-limit";
import {
  buildDailyWeatherByDate,
  clampToForecastWindow,
  daysInclusive,
  intersectDateRanges,
  isIsoDate,
  MAX_WEATHER_RANGE_DAYS,
  parseOpenMeteoAllowedRange,
  type DailyWeather,
} from "@/lib/weather";

export const dynamic = "force-dynamic";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour — forecasts update through the day
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

type WeatherResponse = {
  success: boolean;
  days: Record<string, DailyWeather>;
};

type DateWindow = { startDate: string; endDate: string };

function parseCoord(raw: string | null, name: string): number | NextResponse {
  if (!raw) {
    return NextResponse.json(
      { success: false, error: `Missing ${name}` },
      { status: 400 }
    );
  }
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) {
    return NextResponse.json(
      { success: false, error: `Invalid ${name}` },
      { status: 400 }
    );
  }
  return value;
}

async function fetchOpenMeteoDaily(
  lat: number,
  lng: number,
  window: DateWindow
): Promise<{ ok: true; body: any } | { ok: false; status: number; text: string }> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weather_code");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", window.startDate);
  url.searchParams.set("end_date", window.endDate);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      return { ok: false, status: response.status, text };
    }
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  try {
    const limited = await enforceBffRateLimit(req, "weather");
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const latOrErr = parseCoord(searchParams.get("lat"), "lat");
    if (latOrErr instanceof NextResponse) return latOrErr;
    const lngOrErr = parseCoord(searchParams.get("lng"), "lng");
    if (lngOrErr instanceof NextResponse) return lngOrErr;
    const lat = latOrErr;
    const lng = lngOrErr;

    const startDate = (searchParams.get("startDate") || "").trim();
    const endDate = (searchParams.get("endDate") || "").trim();
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, error: "startDate must be on or before endDate" },
        { status: 400 }
      );
    }
    if (daysInclusive(startDate, endDate) > MAX_WEATHER_RANGE_DAYS) {
      return NextResponse.json(
        { success: false, error: `Date range cannot exceed ${MAX_WEATHER_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    let window = clampToForecastWindow(startDate, endDate);
    if (!window) {
      return NextResponse.json({ success: true, days: {} } satisfies WeatherResponse);
    }

    const cacheKey = `weather:${crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          lat: +lat.toFixed(3),
          lng: +lng.toFixed(3),
          startDate: window.startDate,
          endDate: window.endDate,
        })
      )
      .digest("hex")}`;

    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached) as WeatherResponse);
        }
      } catch (cacheError) {
        console.warn("[weather] Redis cache read error:", cacheError);
      }
    }

    let result = await fetchOpenMeteoDaily(lat, lng, window);
    if (!result.ok) {
      const allowed = parseOpenMeteoAllowedRange(result.text);
      const retried = allowed ? intersectDateRanges(window, allowed) : null;
      if (retried) {
        window = retried;
        result = await fetchOpenMeteoDaily(lat, lng, window);
      }
    }

    if (!result.ok) {
      console.warn("[weather] Open-Meteo unavailable:", result.status, result.text);
      return NextResponse.json({ success: true, days: {} } satisfies WeatherResponse);
    }

    const openMeteo = result.body;
    if (openMeteo?.error) {
      const allowed = parseOpenMeteoAllowedRange(String(openMeteo.reason || ""));
      const retried = allowed ? intersectDateRanges(window, allowed) : null;
      if (retried) {
        const retryResult = await fetchOpenMeteoDaily(lat, lng, retried);
        if (retryResult.ok && !retryResult.body?.error) {
          const daily = retryResult.body?.daily ?? {};
          const days = buildDailyWeatherByDate(
            daily.time,
            daily.weather_code ?? daily.weathercode
          );
          return NextResponse.json({ success: true, days } satisfies WeatherResponse);
        }
      }
      console.warn("[weather] Open-Meteo error:", openMeteo.reason);
      return NextResponse.json({ success: true, days: {} } satisfies WeatherResponse);
    }

    const daily = openMeteo?.daily ?? {};
    const days = buildDailyWeatherByDate(
      daily.time,
      daily.weather_code ?? daily.weathercode
    );
    const payload: WeatherResponse = { success: true, days };

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
      } catch (cacheError) {
        console.warn("[weather] Redis cache write error:", cacheError);
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch weather";
    console.error("[weather]", message);
    return NextResponse.json({ success: true, days: {} } satisfies WeatherResponse);
  }
}
