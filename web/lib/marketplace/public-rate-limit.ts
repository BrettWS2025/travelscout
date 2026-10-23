/**
 * IP-bound rate limits for public marketplace abuse surfaces (security S16).
 *
 * Covers Book now, legacy deal click, and track impressions / detail-view.
 * Store is in-process (fixed-window Map) — acceptable for v1 / single-instance.
 * Multi-instance Redis sharing can replace this later without changing call sites.
 *
 * Fail closed: when the limit is exceeded, callers must return 429 (never skip).
 */

export type PublicRateLimitBucket =
  | "bookNow"
  | "dealClick"
  | "trackImpressions"
  | "trackDetailView";

/** Defaults per bucket (not platform constants from config.ts). */
export const PUBLIC_RATE_LIMIT_DEFAULTS: Record<
  PublicRateLimitBucket,
  { max: number; windowMs: number }
> = {
  bookNow: { max: 30, windowMs: 60_000 },
  dealClick: { max: 60, windowMs: 60_000 },
  trackImpressions: { max: 120, windowMs: 60_000 },
  trackDetailView: { max: 60, windowMs: 60_000 },
};

/** @deprecated Prefer PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.max */
export const BOOK_NOW_RATE_LIMIT_MAX = PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.max;
/** @deprecated Prefer PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.windowMs */
export const BOOK_NOW_RATE_LIMIT_WINDOW_MS =
  PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.windowMs;

type RateBucket = { count: number; windowStartMs: number };

const rateBuckets = new Map<string, RateBucket>();

export function resetPublicRateLimits(): void {
  rateBuckets.clear();
}

/** Clears all public buckets (alias used by Book now tests). */
export function resetBookNowRateLimit(): void {
  resetPublicRateLimits();
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/**
 * Fixed-window check for one bucket + opaque key (e.g. `ip:1.2.3.4`).
 */
export function checkPublicRateLimit(
  bucket: PublicRateLimitBucket,
  key: string,
  nowMs: number = Date.now(),
  max: number = PUBLIC_RATE_LIMIT_DEFAULTS[bucket].max,
  windowMs: number = PUBLIC_RATE_LIMIT_DEFAULTS[bucket].windowMs
): RateLimitResult {
  const mapKey = `${bucket}:${key}`;
  const existing = rateBuckets.get(mapKey);
  if (!existing || nowMs - existing.windowStartMs >= windowMs) {
    rateBuckets.set(mapKey, { count: 1, windowStartMs: nowMs });
    return { ok: true };
  }
  if (existing.count >= max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.windowStartMs + windowMs - nowMs) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  existing.count += 1;
  return { ok: true };
}

/** @deprecated Prefer checkPublicRateLimit("bookNow", key, ...) */
export function checkBookNowRateLimit(
  key: string,
  nowMs: number = Date.now(),
  max: number = BOOK_NOW_RATE_LIMIT_MAX,
  windowMs: number = BOOK_NOW_RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  return checkPublicRateLimit("bookNow", key, nowMs, max, windowMs);
}

export function normalizeClientIp(clientIp?: string | null): string {
  const trimmed = typeof clientIp === "string" ? clientIp.trim() : "";
  return trimmed || "unknown";
}

/**
 * Enforce IP-bound limit for a public bucket. Always keys by IP (fail closed).
 */
export function enforcePublicIpRateLimit(
  bucket: PublicRateLimitBucket,
  clientIp?: string | null,
  nowMs: number = Date.now()
): RateLimitResult {
  return checkPublicRateLimit(
    bucket,
    `ip:${normalizeClientIp(clientIp)}`,
    nowMs
  );
}

/**
 * Book now: always limit by IP; also limit by visitor_id when present so
 * rotating visitor ids from one IP still hit the IP bucket, and a single
 * visitor cannot spray from many IPs unbounded.
 */
export function enforceBookNowRateLimit(opts: {
  clientIp?: string | null;
  visitorId?: string | null;
  nowMs?: number;
}): RateLimitResult {
  const nowMs = opts.nowMs ?? Date.now();
  const ipResult = enforcePublicIpRateLimit("bookNow", opts.clientIp, nowMs);
  if (!ipResult.ok) return ipResult;

  const visitor =
    typeof opts.visitorId === "string" ? opts.visitorId.trim() : "";
  if (visitor) {
    return checkPublicRateLimit("bookNow", `visitor:${visitor}`, nowMs);
  }
  return { ok: true };
}

export function publicRateLimitedResponse(
  retryAfterSec: number,
  message = "Too many requests"
): Response {
  return Response.json(
    { error: message, code: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}
