/**
 * Security S16: IP-bound public rate limits for book / click / track.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPublicRateLimit,
  enforceBookNowRateLimit,
  enforcePublicIpRateLimit,
  PUBLIC_RATE_LIMIT_DEFAULTS,
  publicRateLimitedResponse,
  resetPublicRateLimits,
} from "@/lib/marketplace/public-rate-limit";

describe("Security S16 public rate limits", () => {
  beforeEach(() => {
    resetPublicRateLimits();
  });

  afterEach(() => {
    resetPublicRateLimits();
  });

  it("S16: enforcePublicIpRateLimit returns 429 shape after max", () => {
    const max = 3;
    const now = 1_000_000;
    for (let i = 0; i < max; i++) {
      expect(
        checkPublicRateLimit("dealClick", "ip:1.1.1.1", now, max, 60_000).ok
      ).toBe(true);
    }
    const denied = checkPublicRateLimit(
      "dealClick",
      "ip:1.1.1.1",
      now,
      max,
      60_000
    );
    expect(denied).toMatchObject({ ok: false, retryAfterSec: expect.any(Number) });
  });

  it("S16: different IPs have independent buckets", () => {
    const now = 1_000_000;
    expect(enforcePublicIpRateLimit("trackDetailView", "10.0.0.1", now).ok).toBe(
      true
    );
    expect(enforcePublicIpRateLimit("trackDetailView", "10.0.0.2", now).ok).toBe(
      true
    );
  });

  it("S16: book now limits by IP across rotating visitor ids", () => {
    const now = 1_000_000;
    const max = PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.max;
    for (let i = 0; i < max; i++) {
      expect(
        enforceBookNowRateLimit({
          clientIp: "203.0.113.10",
          visitorId: `visitor-${i}`,
          nowMs: now,
        }).ok
      ).toBe(true);
    }
    const denied = enforceBookNowRateLimit({
      clientIp: "203.0.113.10",
      visitorId: "visitor-new",
      nowMs: now,
    });
    expect(denied).toMatchObject({ ok: false, retryAfterSec: expect.any(Number) });
  });

  it("S16: book now also limits by visitor across different IPs", () => {
    const now = 1_000_000;
    const max = PUBLIC_RATE_LIMIT_DEFAULTS.bookNow.max;
    for (let i = 0; i < max; i++) {
      expect(
        enforceBookNowRateLimit({
          clientIp: `198.51.100.${i}`,
          visitorId: "same-visitor",
          nowMs: now,
        }).ok
      ).toBe(true);
    }
    const denied = enforceBookNowRateLimit({
      clientIp: "198.51.100.250",
      visitorId: "same-visitor",
      nowMs: now,
    });
    expect(denied).toMatchObject({ ok: false, retryAfterSec: expect.any(Number) });
  });

  it("S16: publicRateLimitedResponse is 429 with Retry-After", async () => {
    const res = publicRateLimitedResponse(42, "Too many requests");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    await expect(res.json()).resolves.toEqual({
      error: "Too many requests",
      code: "rate_limited",
    });
  });

  it("S16: track impressions bucket is independent of deal click", () => {
    const now = 1_000_000;
    const clickMax = PUBLIC_RATE_LIMIT_DEFAULTS.dealClick.max;
    for (let i = 0; i < clickMax; i++) {
      expect(enforcePublicIpRateLimit("dealClick", "9.9.9.9", now).ok).toBe(true);
    }
    expect(
      enforcePublicIpRateLimit("dealClick", "9.9.9.9", now).ok
    ).toBe(false);
    expect(
      enforcePublicIpRateLimit("trackImpressions", "9.9.9.9", now).ok
    ).toBe(true);
  });
});
