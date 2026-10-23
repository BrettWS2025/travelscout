/**
 * Security S16: rate-limit public track impressions / detail-view by IP.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postImpressions } from "../track/impressions/route";
import { POST as postDetailView } from "../track/detail-view/route";
import {
  PUBLIC_RATE_LIMIT_DEFAULTS,
  resetPublicRateLimits,
} from "@/lib/marketplace/public-rate-limit";

vi.mock("@/lib/marketplace/deal-draft-http", () => ({
  getDealDraftHttpStore: () => ({
    deals: new Map([
      [
        "deal-1",
        {
          id: "deal-1",
          slug: "test-deal",
          operatorId: "op-1",
          status: "live",
        },
      ],
    ]),
    trackingEvents: new Map(),
  }),
  dealDraftErrorResponse: (err: unknown, fallback: string) =>
    Response.json(
      { error: err instanceof Error ? err.message : fallback },
      { status: 500 }
    ),
}));

describe("Security S16 track rate limits", () => {
  beforeEach(() => {
    resetPublicRateLimits();
  });

  afterEach(() => {
    resetPublicRateLimits();
  });

  it("S16: impressions returns 429 after IP limit", async () => {
    const max = PUBLIC_RATE_LIMIT_DEFAULTS.trackImpressions.max;
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.9",
    };
    const body = JSON.stringify({
      items: [{ deal_id: "deal-1", visitor_id: "v1" }],
    });

    for (let i = 0; i < max; i++) {
      const res = await postImpressions(
        new Request("http://localhost/api/marketplace/track/impressions", {
          method: "POST",
          headers,
          body,
        })
      );
      expect(res.status).toBe(200);
    }

    const limited = await postImpressions(
      new Request("http://localhost/api/marketplace/track/impressions", {
        method: "POST",
        headers,
        body,
      })
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      code: "rate_limited",
    });
  });

  it("S16: detail-view returns 429 after IP limit", async () => {
    const max = PUBLIC_RATE_LIMIT_DEFAULTS.trackDetailView.max;
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.10",
    };
    const body = JSON.stringify({
      deal_id: "deal-1",
      visitor_id: "v1",
    });

    for (let i = 0; i < max; i++) {
      const res = await postDetailView(
        new Request("http://localhost/api/marketplace/track/detail-view", {
          method: "POST",
          headers,
          body,
        })
      );
      expect(res.status).toBe(200);
    }

    const limited = await postDetailView(
      new Request("http://localhost/api/marketplace/track/detail-view", {
        method: "POST",
        headers,
        body,
      })
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      code: "rate_limited",
    });
  });
});
