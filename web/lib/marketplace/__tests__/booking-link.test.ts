/**
 * Chunk 15: booking destination validators + link checker.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTrackedUrl,
  checkLink,
  dealEligibleForLinkCheckJob,
  PLATFORM_UTM_SOURCE,
  runLinkCheck,
  runLinkCheckerJob,
  testDealLink,
  validateBookingDestinationFields,
  type FetchLike,
} from "../booking-link";
import { createDealDraftStore, seedDealPriceOption } from "../deal-draft";
import { listDealEvents } from "../deal-audit";
import { makeDealFixture, seedDeal } from "../deal-status";
import type { DealPriceOption } from "../deal-session";
import { validateDealFields } from "../deal";

const NOW = "2026-10-20T06:00:00.000Z";
const DEAL_ID = "deal-link-1";
const OP_ID = "op-1";

function mockFetchSequence(
  responses: Array<
    | { status: number; method?: string }
    | { throw: Error; method?: string }
  >
): FetchLike {
  let i = 0;
  return async (_url, init) => {
    const step = responses[i++] ?? { status: 500 };
    const method = (init?.method ?? "GET").toUpperCase();
    if ("method" in step && step.method && step.method !== method) {
      throw new Error(`expected ${step.method} got ${method}`);
    }
    if ("throw" in step) throw step.throw;
    return new Response(null, { status: step.status });
  };
}

function storeWithLiveUrl(overrides: Partial<ReturnType<typeof makeDealFixture>> = {}) {
  const store = createDealDraftStore();
  const deal = makeDealFixture({
    id: DEAL_ID,
    operatorId: OP_ID,
    status: "live",
    slug: "harbour-kayak",
    bookingDestinationType: "operator_website",
    bookingUrl: "https://harbour.example/book?ref=1",
    appendTrackingParams: true,
    linkStatus: "unchecked",
    linkConsecutiveFailures: 0,
    firstPublishedAt: NOW,
    publishedAt: NOW,
    ...overrides,
  });
  seedDeal({ deals: store.deals, audit: store.audit }, deal);
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateBookingDestinationFields", () => {
  it("accepts https URL, E.164 phone, valid email", () => {
    expect(
      validateBookingDestinationFields({
        bookingUrl: "https://book.example/x",
        bookingPhone: "+6421234567",
        bookingEmail: "book@harbour.example",
      })
    ).toEqual([]);
  });

  it("rejects http URL, bad phone, bad email", () => {
    const errors = validateBookingDestinationFields({
      bookingUrl: "http://insecure.example/book",
      bookingPhone: "021234567",
      bookingEmail: "not-an-email",
    });
    expect(errors.map((e) => e.field).sort()).toEqual([
      "booking_email",
      "booking_phone",
      "booking_url",
    ]);
  });

  it("is wired into validateDealFields", () => {
    const errors = validateDealFields({
      bookingUrl: "ftp://x",
      bookingPhone: "123",
      bookingEmail: "a@",
    });
    expect(errors.some((e) => e.field === "booking_url")).toBe(true);
    expect(errors.some((e) => e.field === "booking_phone")).toBe(true);
    expect(errors.some((e) => e.field === "booking_email")).toBe(true);
  });
});

describe("checkLink", () => {
  it("ok on 200", async () => {
    const result = await checkLink("https://ok.example/", {
      fetchFn: mockFetchSequence([{ status: 200, method: "HEAD" }]),
    });
    expect(result).toEqual({ ok: true, status: 200, error: null });
  });

  it("ok on 301→200 (followed redirect status)", async () => {
    // With redirect:follow the final response is typically 200
    const result = await checkLink("https://redirect.example/", {
      fetchFn: mockFetchSequence([{ status: 200, method: "HEAD" }]),
    });
    expect(result.ok).toBe(true);
  });

  it("treats final 3xx as ok", async () => {
    const result = await checkLink("https://soft-redirect.example/", {
      fetchFn: mockFetchSequence([{ status: 302, method: "HEAD" }]),
    });
    expect(result).toEqual({ ok: true, status: 302, error: null });
  });

  it("fails on 404", async () => {
    const result = await checkLink("https://missing.example/", {
      fetchFn: mockFetchSequence([{ status: 404, method: "HEAD" }]),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it("falls back to GET when HEAD throws", async () => {
    const result = await checkLink("https://no-head.example/", {
      fetchFn: mockFetchSequence([
        { throw: new Error("HEAD blocked"), method: "HEAD" },
        { status: 200, method: "GET" },
      ]),
    });
    expect(result).toEqual({ ok: true, status: 200, error: null });
  });

  it("falls back to GET when HEAD returns 405", async () => {
    const result = await checkLink("https://method-not-allowed.example/", {
      fetchFn: mockFetchSequence([
        { status: 405, method: "HEAD" },
        { status: 200, method: "GET" },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("reports timeout", async () => {
    const result = await checkLink("https://slow.example/", {
      timeoutMs: 20,
      fetchFn: async (_url, init) =>
        new Promise((_resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error("should have aborted")),
            500
          );
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("timeout");
  });
});

describe("buildTrackedUrl", () => {
  it("appends utm params and click_id, preserves existing query", () => {
    const url = buildTrackedUrl(
      "https://harbour.example/book?ref=1",
      { slug: "harbour-kayak" },
      "click-abc"
    );
    const u = new URL(url);
    expect(u.searchParams.get("ref")).toBe("1");
    expect(u.searchParams.get("utm_source")).toBe(PLATFORM_UTM_SOURCE);
    expect(u.searchParams.get("utm_medium")).toBe("referral");
    expect(u.searchParams.get("utm_campaign")).toBe("harbour-kayak");
    expect(u.searchParams.get("click_id")).toBe("click-abc");
  });
});

describe("runLinkCheck", () => {
  it("two consecutive failures on live → auto_paused(link_broken), then success → live", async () => {
    const store = storeWithLiveUrl();

    const failFetch = mockFetchSequence([
      { status: 404 },
      { status: 404 },
      { status: 200 },
    ]);

    const first = await runLinkCheck(store, DEAL_ID, {
      now: NOW,
      fetchFn: failFetch,
      skipEvidenceChecks: true,
    });
    expect(first.deal.linkStatus).toBe("broken");
    expect(first.deal.linkConsecutiveFailures).toBe(1);
    expect(first.deal.status).toBe("live");
    expect(first.autoPaused).toBe(false);

    const second = await runLinkCheck(store, DEAL_ID, {
      now: "2026-10-20T12:00:00.000Z",
      fetchFn: failFetch,
      skipEvidenceChecks: true,
    });
    expect(second.deal.linkConsecutiveFailures).toBe(2);
    expect(second.deal.status).toBe("auto_paused");
    expect(second.deal.pauseReason).toBe("link_broken");
    expect(second.autoPaused).toBe(true);

    const events = listDealEvents(store.audit, DEAL_ID);
    expect(events.some((e) => e.eventType === "auto_paused")).toBe(true);

    const recovered = await runLinkCheck(store, DEAL_ID, {
      now: "2026-10-20T18:00:00.000Z",
      fetchFn: failFetch,
      skipEvidenceChecks: true,
    });
    expect(recovered.deal.linkStatus).toBe("ok");
    expect(recovered.deal.linkConsecutiveFailures).toBe(0);
    expect(recovered.deal.status).toBe("live");
    expect(recovered.autoResumed).toBe(true);
  });

  it("stores evidence URL reachability without auto-pausing", async () => {
    const store = storeWithLiveUrl({ status: "draft", publishedAt: null });
    const opt: DealPriceOption = {
      id: "po-1",
      dealId: DEAL_ID,
      label: "Adult",
      type: "adult",
      externalPriceOptionId: null,
      externalDealPriceOptionId: null,
      originalPriceMinor: 20000,
      originalPriceSource: "operator_entered",
      originalPriceEvidenceUrl: "https://harbour.example/prices",
      dealPriceMinor: 9000,
      discountPct: 55,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    seedDealPriceOption(store, opt);

    // Booking URL ok, evidence 404
    let call = 0;
    const fetchFn: FetchLike = async (url) => {
      call += 1;
      if (String(url).includes("/prices")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200 });
    };

    const result = await runLinkCheck(store, DEAL_ID, {
      now: NOW,
      fetchFn,
    });
    expect(result.deal.status).toBe("draft");
    expect(result.evidenceChecks).toHaveLength(1);
    expect(result.evidenceChecks[0].ok).toBe(false);
    expect(result.evidenceChecks[0].status).toBe(404);
    expect(store.evidenceUrlChecks?.get("po-1")?.ok).toBe(false);
    expect(call).toBeGreaterThanOrEqual(2);
  });
});

describe("testDealLink / job", () => {
  it("returns tracked URL and check result", async () => {
    const store = storeWithLiveUrl();
    const out = await testDealLink(store, DEAL_ID, {
      now: NOW,
      clickId: "click-test-1",
      fetchFn: mockFetchSequence([{ status: 200 }]),
      skipEvidenceChecks: true,
    });
    expect(out.tracked).toBe(true);
    expect(out.url).toContain("utm_source=travelscout");
    expect(out.url).toContain("click_id=click-test-1");
    expect(out.url).toContain("ref=1");
    expect(out.check.ok).toBe(true);
  });

  it("job only targets live/scheduled/auto_paused(link_broken) URL deals", () => {
    expect(
      dealEligibleForLinkCheckJob(
        makeDealFixture({
          id: "a",
          operatorId: OP_ID,
          status: "live",
          bookingDestinationType: "operator_website",
          bookingUrl: "https://x.example",
        })
      )
    ).toBe(true);
    expect(
      dealEligibleForLinkCheckJob(
        makeDealFixture({
          id: "b",
          operatorId: OP_ID,
          status: "auto_paused",
          pauseReason: "attestation_expired",
          bookingDestinationType: "operator_website",
          bookingUrl: "https://x.example",
        })
      )
    ).toBe(false);
    expect(
      dealEligibleForLinkCheckJob(
        makeDealFixture({
          id: "c",
          operatorId: OP_ID,
          status: "draft",
          bookingDestinationType: "operator_website",
          bookingUrl: "https://x.example",
        })
      )
    ).toBe(false);
    expect(
      dealEligibleForLinkCheckJob(
        makeDealFixture({
          id: "d",
          operatorId: OP_ID,
          status: "live",
          bookingDestinationType: "phone",
          bookingPhone: "+6421234567",
        })
      )
    ).toBe(false);
  });

  it("runLinkCheckerJob checks eligible deals", async () => {
    const store = storeWithLiveUrl();
    seedDeal(
      { deals: store.deals, audit: store.audit },
      makeDealFixture({
        id: "draft-skip",
        operatorId: OP_ID,
        status: "draft",
        bookingDestinationType: "operator_website",
        bookingUrl: "https://skip.example",
      })
    );

    const job = await runLinkCheckerJob(store, {
      now: NOW,
      fetchFn: mockFetchSequence([{ status: 200 }]),
      skipEvidenceChecks: true,
    });
    expect(job.checked).toBe(1);
    expect(job.results[0].deal.id).toBe(DEAL_ID);
  });
});
