import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getRedisClient } from "@/lib/redis/client";
import { enforceBffRateLimit } from "@/lib/bff-rate-limit";

export const dynamic = "force-dynamic";

type LiteApiHotelCard = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  rating?: number | null;
  imageUrl?: string;
  minRate: number;
  maxRate: number;
  currency: string;
  offerId: string;
  bookingUrl: string;
};

type LiteApiHotelResponse = {
  success: boolean;
  hotels: LiteApiHotelCard[];
  total: number;
};

type RawLiteHotel = Record<string, unknown>;
type RawLiteMinRate = Record<string, unknown>;
const inflightRequests = new Map<string, Promise<LiteApiHotelResponse>>();

class LiteApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function pickHotelImage(hotel: RawLiteHotel): string | undefined {
  const direct = toString(hotel.imageUrl) || toString(hotel.main_photo) || toString(hotel.mainPhoto);
  if (direct) return direct;

  const photos = hotel.photos;
  if (Array.isArray(photos) && photos.length > 0) {
    const first = photos[0];
    if (first && typeof first === "object") {
      const p = first as Record<string, unknown>;
      return toString(p.url) || toString(p.photoUrl) || toString(p.failoverPhoto);
    }
  }
  return undefined;
}

function buildBookingUrl(params: {
  offerId: string;
  currency: string;
  checkin: string;
  checkout: string;
}): string {
  const baseUrl =
    process.env.LITEAPI_WHITELABEL_BASE_URL?.trim() ||
    process.env.LITEAPI_WL_BASE_URL?.trim() ||
    "https://test.nuitee.link";
  const sandbox =
    (process.env.LITEAPI_SANDBOX || process.env.NEXT_PUBLIC_LITEAPI_SANDBOX || "true").toLowerCase() ===
    "true";

  const url = new URL("/booking", baseUrl);
  url.searchParams.set("offerId", params.offerId);
  url.searchParams.set("currency", params.currency);
  url.searchParams.set("language", "en");
  if (sandbox) url.searchParams.set("isSandbox", "true");
  // Keep dates on the URL for partner analytics / debugging context.
  url.searchParams.set("checkin", params.checkin);
  url.searchParams.set("checkout", params.checkout);
  return url.toString();
}

async function fetchLiteApiJson<T>(path: string, init: RequestInit): Promise<T> {
  const apiKey = getLiteApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing LiteAPI key. Set LITEAPI_API_KEY (or NEXT_PUBLIC_LITEAPI_API_KEY) in environment."
    );
  }
  const res = await fetch(`https://api.liteapi.travel/v3.0${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LiteApiHttpError(res.status, `LiteAPI error ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

let cachedLiteApiKey: string | null = null;

function parseKeyFromEnvFilePath(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    // Some Windows editors save UTF-16/BOM variants; remove null chars + BOM before parsing.
    const normalized = raw.replace(/\u0000/g, "").replace(/^\uFEFF/, "");
    const match =
      normalized.match(/^\s*LITEAPI_API_KEY\s*=\s*(.+)\s*$/m) ||
      normalized.match(/^\s*NEXT_PUBLIC_LITEAPI_API_KEY\s*=\s*(.+)\s*$/m);
    if (!match?.[1]) return null;
    const value = match[1].trim();
    if (!value) return null;
    return value.replace(/^['"]|['"]$/g, "").trim();
  } catch {
    return null;
  }
}

function parseKeyFromEnvFile(): string | null {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.resolve(".env.local"),
    "C:\\code\\travelscout\\.env.local",
  ];
  for (const candidate of candidates) {
    const key = parseKeyFromEnvFilePath(candidate);
    if (key) return key;
  }
  return null;
}

function getLiteApiKey(): string | null {
  if (cachedLiteApiKey) return cachedLiteApiKey;

  const keyFromEnv =
    process.env.LITEAPI_API_KEY ||
    process.env.NEXT_PUBLIC_LITEAPI_API_KEY ||
    process.env.LITE_API_KEY ||
    null;
  if (keyFromEnv && keyFromEnv.trim().length > 0) {
    cachedLiteApiKey = keyFromEnv.trim();
    return cachedLiteApiKey;
  }

  const keyFromFile = parseKeyFromEnvFile();
  if (keyFromFile) {
    cachedLiteApiKey = keyFromFile;
    return cachedLiteApiKey;
  }

  return null;
}

function getLiteApiCacheTtlSeconds(): number {
  const raw = Number(process.env.LITEAPI_HOTELS_CACHE_TTL_SECONDS || 1800);
  if (!Number.isFinite(raw) || raw <= 0) return 1800;
  return Math.min(Math.floor(raw), 24 * 60 * 60);
}

function responseWithCacheHeaders(payload: LiteApiHotelResponse) {
  const maxAge = Math.min(getLiteApiCacheTtlSeconds(), 3600);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=300`,
    },
  });
}

async function incrementMetric(metric: string) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `metrics:liteapi-hotels:${day}:${metric}`;
    await redis.incr(key);
    await redis.expire(key, 60 * 60 * 24 * 14);
  } catch {
    // Metrics are best-effort only.
  }
}

export async function GET(req: Request) {
  try {
    const limited = await enforceBffRateLimit(req, "liteapiHotels");
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const lat = toNumber(searchParams.get("lat"));
    const lng = toNumber(searchParams.get("lng"));
    const checkin = toString(searchParams.get("checkin"));
    const checkout = toString(searchParams.get("checkout"));
    const nights = Math.max(1, Number(searchParams.get("nights") || 1));
    const currency = (toString(searchParams.get("currency")) || "NZD").toUpperCase();
    const guestNationality = (toString(searchParams.get("guestNationality")) || "NZ").toUpperCase();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 20), 30));
    const radiusKm = Math.max(1, Math.min(Number(searchParams.get("radiusKm") || 12), 30));
    const radiusMeters = Math.max(1001, Math.round(radiusKm * 1000));

    if (lat === undefined || lng === undefined || !checkin || !checkout) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required params",
          message: "Expected lat, lng, checkin and checkout query params.",
        },
        { status: 400 }
      );
    }

    const cacheKey = `liteapi-hotels:${crypto
      .createHash("sha256")
      .update(
        JSON.stringify({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), checkin, checkout, currency, guestNationality, limit, radiusKm })
      )
      .digest("hex")}`;

    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        await incrementMetric("cache_hit");
        return responseWithCacheHeaders(JSON.parse(cached) as LiteApiHotelResponse);
      }
    }

    await incrementMetric("cache_miss");
    const requestPromise =
      inflightRequests.get(cacheKey) ||
      (async () => {
        await incrementMetric("upstream_hotels_search_request");
        const hotelsSearch = await fetchLiteApiJson<{ data?: RawLiteHotel[] }>(
          `/data/hotels?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(
            String(lng)
          )}&radius=${encodeURIComponent(String(radiusMeters))}&limit=${encodeURIComponent(String(limit))}`,
          { method: "GET" }
        );

        const hotelsRaw = Array.isArray(hotelsSearch?.data) ? hotelsSearch.data : [];
        const hotelIds = hotelsRaw
          .map((h) => toString(h.hotelId) || toString(h.id))
          .filter((id): id is string => typeof id === "string");

        if (hotelIds.length === 0) {
          return { success: true, hotels: [], total: 0 } satisfies LiteApiHotelResponse;
        }

        await incrementMetric("upstream_min_rates_request");
        const minRates = await fetchLiteApiJson<{ data?: RawLiteMinRate[] }>("/hotels/min-rates", {
          method: "POST",
          body: JSON.stringify({
            hotelIds,
            checkin,
            checkout,
            currency,
            guestNationality,
            occupancies: [{ adults: 2, children: [] }],
            timeout: 8,
          }),
        });

        const minRatesRaw = Array.isArray(minRates?.data) ? minRates.data : [];
        const minRateByHotelId = new Map<string, RawLiteMinRate>();
        for (const r of minRatesRaw) {
          const id = toString(r.hotelId);
          if (id) minRateByHotelId.set(id, r);
        }

        const hotels: LiteApiHotelCard[] = hotelsRaw
          .map((hotel) => {
            const hotelId = toString(hotel.hotelId) || toString(hotel.id);
            if (!hotelId) return null;

            const rate = minRateByHotelId.get(hotelId);
            if (!rate) return null;

            const price = toNumber(rate.price);
            const suggested = toNumber(rate.suggestedSellingPrice);
            const offerId = toString(rate.offerId);
            if (price === undefined || !offerId) return null;

            const minRate = Math.min(price, suggested ?? price);
            const maxRate = Math.max(price, suggested ?? price);
            const name = toString(hotel.name) || toString(hotel.hotelName) || "Hotel";
            const latitude = toNumber(hotel.latitude) ?? toNumber(hotel.lat);
            const longitude = toNumber(hotel.longitude) ?? toNumber(hotel.lng);
            const rating = toNumber(hotel.rating) ?? null;
            const address =
              toString(hotel.address) || toString(hotel.formattedAddress) || toString(hotel.addressLine1);
            const city = toString(hotel.city) || toString(hotel.cityName);
            const countryCode = toString(hotel.countryCode);
            const bookingUrl = buildBookingUrl({ offerId, currency, checkin, checkout });

            return {
              id: hotelId,
              name,
              address,
              city,
              countryCode,
              latitude,
              longitude,
              rating,
              imageUrl: pickHotelImage(hotel),
              minRate,
              maxRate,
              currency,
              offerId,
              bookingUrl,
            } satisfies LiteApiHotelCard;
          })
          .filter((h): h is LiteApiHotelCard => h !== null)
          .sort((a, b) => a.minRate - b.minRate)
          .slice(0, Math.min(30, limit));

        return {
          success: true,
          hotels,
          total: hotels.length,
        } satisfies LiteApiHotelResponse;
      })();

    inflightRequests.set(cacheKey, requestPromise);
    const responseData = await requestPromise.finally(() => inflightRequests.delete(cacheKey));

    if (redis) {
      await redis
        .setex(cacheKey, getLiteApiCacheTtlSeconds(), JSON.stringify(responseData))
        .catch(() => undefined);
    }

    return responseWithCacheHeaders(responseData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[liteapi-hotels] error:", error);
    const status =
      error instanceof LiteApiHttpError
        ? error.status
        : message.includes("Missing LiteAPI key")
          ? 500
          : 500;
    await incrementMetric(`error_${status}`);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch hotels",
        message,
      },
      { status }
    );
  }
}

