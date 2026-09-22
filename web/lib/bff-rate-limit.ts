import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis/client";

/** Logical buckets for paid / quota’d BFF routes (per client IP, fixed time windows). */
export type BffRateLimitBucket =
  | "viator"
  | "googlePlaces"
  | "events"
  | "ticketmaster"
  | "viatorTags"
  | "liteapiHotels"
  | "weather";

const DEFAULT_MAX: Record<BffRateLimitBucket, number> = {
  viator: 60,
  googlePlaces: 120,
  events: 40,
  ticketmaster: 40,
  viatorTags: 120,
  liteapiHotels: 120,
  weather: 120,
};

const ENV_MAX: Record<BffRateLimitBucket, string> = {
  viator: "BFF_RATE_LIMIT_VIATOR_MAX",
  googlePlaces: "BFF_RATE_LIMIT_GOOGLE_PLACES_MAX",
  events: "BFF_RATE_LIMIT_EVENTS_MAX",
  ticketmaster: "BFF_RATE_LIMIT_TICKETMASTER_MAX",
  viatorTags: "BFF_RATE_LIMIT_VIATOR_TAGS_MAX",
  liteapiHotels: "BFF_RATE_LIMIT_LITEAPI_HOTELS_MAX",
  weather: "BFF_RATE_LIMIT_WEATHER_MAX",
};

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function getWindowSeconds(): number {
  const raw = parseInt(process.env.BFF_RATE_LIMIT_WINDOW_SECONDS || "60", 10);
  if (!Number.isFinite(raw)) return 60;
  return Math.max(5, Math.min(3600, raw));
}

function getMaxForBucket(bucket: BffRateLimitBucket): number {
  const envName = ENV_MAX[bucket];
  const raw = process.env[envName];
  if (raw !== undefined) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MAX[bucket];
}

/**
 * Fixed-window rate limit using Redis INCR. If Redis is unavailable, the request is allowed
 * (same as no cache). Set `REDIS_URL` / `REDIS_HOST` in production for enforcement.
 *
 * Set `BFF_RATE_LIMIT_ENABLED=false` to disable entirely (e.g. local dev).
 */
export async function enforceBffRateLimit(
  req: Request,
  bucket: BffRateLimitBucket
): Promise<NextResponse | null> {
  if (process.env.BFF_RATE_LIMIT_ENABLED === "false") {
    return null;
  }

  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const windowSec = getWindowSeconds();
  const max = getMaxForBucket(bucket);
  const ip = getClientIp(req);
  const windowMs = windowSec * 1000;
  const windowIndex = Math.floor(Date.now() / windowMs);
  const key = `rl:bff:${bucket}:${ip}:${windowIndex}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec * 2);
    }
    if (count > max) {
      return NextResponse.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Try again in about ${windowSec} seconds.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(windowSec),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  } catch (e) {
    console.warn("[bff-rate-limit] Redis error, allowing request:", e);
  }

  return null;
}
