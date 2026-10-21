import { describe, expect, it } from "vitest";
import { listDealEvents } from "@/lib/marketplace/deal-audit";
import { AUTO_RESUME_REASONS, DEAL_STATUSES } from "@/lib/marketplace/enums";
import {
  AutoPauseClearError,
  DealStatusError,
  InvalidDealTransitionError,
  PublishValidationFailedError,
  applyAutoPause,
  applyClientDealFieldPatch,
  clearAutoPause,
  createDealStatusStore,
  eventTypeForTransition,
  isAllowedDealTransition,
  logDealEvent,
  makeDealFixture,
  seedDeal,
  stripSystemOwnedDealFields,
  stubValidateForPublish,
  transitionDeal,
} from "@/lib/marketplace/deal-status";
import type { DealStatus } from "@/lib/marketplace/enums";

const DEAL_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OPERATOR_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOW = "2026-10-20T03:00:00.000Z";

const ALLOWED: Array<[DealStatus, DealStatus]> = [
  ["draft", "pending_review"],
  ["draft", "scheduled"],
  ["draft", "live"],
  ["pending_review", "scheduled"],
  ["pending_review", "live"],
  ["pending_review", "draft"],
  ["scheduled", "live"],
  ["scheduled", "paused"],
  ["scheduled", "auto_paused"],
  ["live", "paused"],
  ["paused", "live"],
  ["paused", "scheduled"],
  ["live", "auto_paused"],
  ["auto_paused", "live"],
  ["auto_paused", "scheduled"],
  ["live", "sold_out"],
  ["sold_out", "live"],
  ["live", "expired"],
  ["sold_out", "expired"],
  ["auto_paused", "expired"],
  ["paused", "expired"],
  ["scheduled", "expired"],
  ["expired", "archived"],
  ["ended", "archived"],
  // any except archived → ended (not self)
  ["draft", "ended"],
  ["pending_review", "ended"],
  ["scheduled", "ended"],
  ["live", "ended"],
  ["paused", "ended"],
  ["auto_paused", "ended"],
  ["sold_out", "ended"],
  ["expired", "ended"],
];

function storeWith(
  status: DealStatus,
  extras: Partial<ReturnType<typeof makeDealFixture>> = {}
) {
  const store = createDealStatusStore();
  seedDeal(
    store,
    makeDealFixture({
      id: DEAL_ID,
      operatorId: OPERATOR_ID,
      status,
      ...extras,
    })
  );
  return store;
}

describe("isAllowedDealTransition", () => {
  it("allows every Chunk 11 edge", () => {
    for (const [from, to] of ALLOWED) {
      expect(isAllowedDealTransition(from, to)).toBe(true);
    }
  });

  it("rejects a disallowed transition (archived → live)", () => {
    expect(isAllowedDealTransition("archived", "live")).toBe(false);
    expect(isAllowedDealTransition("draft", "paused")).toBe(false);
    expect(isAllowedDealTransition("live", "draft")).toBe(false);
  });
});

describe("logDealEvent", () => {
  it("appends an event with actor shape", () => {
    const store = createDealStatusStore();
    const event = logDealEvent(
      store.audit,
      DEAL_ID,
      "created",
      { type: "user", id: "user-1" },
      { note: "hi" },
      { now: NOW }
    );
    expect(event.actorType).toBe("user");
    expect(event.actorId).toBe("user-1");
    expect(event.detail).toEqual({ note: "hi" });
    expect(listDealEvents(store.audit, DEAL_ID)).toHaveLength(1);
  });
});

describe("transitionDeal — allowed transitions", () => {
  it.each(ALLOWED)(
    "%s → %s writes DealEvent and updates status",
    (from, to) => {
      const store = storeWith(from);
      const deal = transitionDeal(store, DEAL_ID, to, {
        actor: { type: "user", id: "u1" },
        reason: to === "auto_paused" ? "sync_failure" : undefined,
        detail: to === "auto_paused" || to === "paused" ? "because" : undefined,
        now: NOW,
      });

      expect(deal.status).toBe(to);
      const events = listDealEvents(store.audit, DEAL_ID);
      expect(events).toHaveLength(1);
      expect(events[0].detail.from_status).toBe(from);
      expect(events[0].detail.to_status).toBe(to);
      expect(events[0].eventType).toBe(eventTypeForTransition(from, to));
    }
  );

  it("throws InvalidDealTransitionError on disallowed edge", () => {
    const store = storeWith("draft");
    expect(() =>
      transitionDeal(store, DEAL_ID, "paused", {
        actor: { type: "user" },
        now: NOW,
      })
    ).toThrow(InvalidDealTransitionError);

    expect(store.deals.get(DEAL_ID)?.status).toBe("draft");
    expect(listDealEvents(store.audit, DEAL_ID)).toHaveLength(0);
  });
});

describe("transitionDeal — pause fields and timestamps", () => {
  it("sets pause_reason=operator when entering paused; clears on resume", () => {
    const store = storeWith("live");
    const paused = transitionDeal(store, DEAL_ID, "paused", {
      actor: { type: "user", id: "u1" },
      detail: "Taking a break",
      now: NOW,
    });
    expect(paused.pauseReason).toBe("operator");
    expect(paused.pauseDetail).toBe("Taking a break");

    const live = transitionDeal(store, DEAL_ID, "live", {
      actor: { type: "user", id: "u1" },
      now: "2026-10-20T04:00:00.000Z",
    });
    expect(live.pauseReason).toBeNull();
    expect(live.pauseDetail).toBeNull();
    expect(listDealEvents(store.audit, DEAL_ID).map((e) => e.eventType)).toEqual(
      ["paused", "resumed"]
    );
  });

  it("sets pause_reason=admin when entering paused with reason admin", () => {
    const store = storeWith("live");
    const paused = transitionDeal(store, DEAL_ID, "paused", {
      actor: { type: "admin", id: "a1" },
      reason: "admin",
      detail: "Policy",
      now: NOW,
    });
    expect(paused.pauseReason).toBe("admin");
    expect(paused.pauseDetail).toBe("Policy");
  });

  it("stores reject notes in pause_detail when pending_review → draft", () => {
    const store = storeWith("pending_review");
    const rejected = transitionDeal(store, DEAL_ID, "draft", {
      actor: { type: "admin", id: "a1" },
      detail: "Fix the photos",
      now: NOW,
    });
    expect(rejected.status).toBe("draft");
    expect(rejected.pauseReason).toBeNull();
    expect(rejected.pauseDetail).toBe("Fix the photos");
    expect(listDealEvents(store.audit, DEAL_ID)[0].eventType).toBe("rejected");
  });

  it("sets given reason on auto_paused and clears on auto_resume", () => {
    const store = storeWith("live");
    const paused = transitionDeal(store, DEAL_ID, "auto_paused", {
      actor: { type: "system" },
      reason: "link_broken",
      detail: "404 twice",
      now: NOW,
    });
    expect(paused.pauseReason).toBe("link_broken");
    expect(paused.pauseDetail).toBe("404 twice");

    const live = transitionDeal(store, DEAL_ID, "live", {
      actor: { type: "system" },
      now: "2026-10-20T05:00:00.000Z",
    });
    expect(live.pauseReason).toBeNull();
    expect(
      listDealEvents(store.audit, DEAL_ID).map((e) => e.eventType)
    ).toEqual(["auto_paused", "auto_resumed"]);
  });

  it("sets published_at and first_published_at on first entry to scheduled", () => {
    const store = storeWith("draft");
    const scheduled = transitionDeal(store, DEAL_ID, "scheduled", {
      actor: { type: "user" },
      now: NOW,
    });
    expect(scheduled.firstPublishedAt).toBe(NOW);
    expect(scheduled.publishedAt).toBe(NOW);

    const live = transitionDeal(store, DEAL_ID, "live", {
      actor: { type: "system" },
      now: "2026-10-21T00:00:00.000Z",
    });
    // First-publish timestamps stay from the scheduled entry
    expect(live.firstPublishedAt).toBe(NOW);
    expect(live.publishedAt).toBe(NOW);
  });

  it("sets published_at and first_published_at on first entry to live", () => {
    const store = storeWith("draft");
    const live = transitionDeal(store, DEAL_ID, "live", {
      actor: { type: "user" },
      now: NOW,
    });
    expect(live.firstPublishedAt).toBe(NOW);
    expect(live.publishedAt).toBe(NOW);
  });

  it("sets ended_at when entering ended", () => {
    const store = storeWith("live");
    const ended = transitionDeal(store, DEAL_ID, "ended", {
      actor: { type: "user" },
      now: NOW,
    });
    expect(ended.endedAt).toBe(NOW);
    expect(ended.status).toBe("ended");
  });

  it("requires reason for auto_paused", () => {
    const store = storeWith("live");
    expect(() =>
      transitionDeal(store, DEAL_ID, "auto_paused", {
        actor: { type: "system" },
        now: NOW,
      })
    ).toThrow(DealStatusError);
  });
});

describe("applyAutoPause / clearAutoPause", () => {
  it("auto-pauses a live deal", () => {
    const store = storeWith("live");
    const deal = applyAutoPause(
      store,
      DEAL_ID,
      "attestation_expired",
      "Seats not reconfirmed",
      { now: NOW }
    );
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("attestation_expired");
  });

  it("is idempotent for the same reason", () => {
    const store = storeWith("live");
    applyAutoPause(store, DEAL_ID, "sync_failure", "stale", { now: NOW });
    const again = applyAutoPause(store, DEAL_ID, "sync_failure", "stale", {
      now: "2026-10-20T03:01:00.000Z",
    });
    expect(again.status).toBe("auto_paused");
    // Only one transition event (idempotent no-op)
    expect(
      listDealEvents(store.audit, DEAL_ID).filter(
        (e) => e.eventType === "auto_paused"
      )
    ).toHaveLength(1);
  });

  it("clearAutoPause resumes when reason matches and is auto-resumable", async () => {
    const store = storeWith("auto_paused", {
      pauseReason: "link_broken",
      pauseDetail: "404",
    });
    expect(AUTO_RESUME_REASONS).toContain("link_broken");

    const live = await clearAutoPause(store, DEAL_ID, "link_broken", {
      now: NOW,
    });
    expect(live.status).toBe("live");
    expect(live.pauseReason).toBeNull();
  });

  it("clearAutoPause rejects wrong reason / non-resumable / not auto_paused", async () => {
    const store = storeWith("auto_paused", {
      pauseReason: "session_cancelled",
    });
    await expect(
      clearAutoPause(store, DEAL_ID, "session_cancelled")
    ).rejects.toThrow(AutoPauseClearError);

    const store2 = storeWith("auto_paused", {
      pauseReason: "link_broken",
    });
    await expect(
      clearAutoPause(store2, DEAL_ID, "sync_failure")
    ).rejects.toThrow(/not sync_failure/);

    const store3 = storeWith("live");
    await expect(
      clearAutoPause(store3, DEAL_ID, "link_broken")
    ).rejects.toThrow(/not auto_paused/);
  });

  it("clearAutoPause re-runs publish validation before going live", async () => {
    const store = storeWith("auto_paused", {
      pauseReason: "sync_failure",
    });
    await expect(
      clearAutoPause(store, DEAL_ID, "sync_failure", {
        validateForPublish: () => ({
          ok: false,
          checks: [
            {
              key: "required_fields",
              label: "Required",
              passed: false,
              message: "title missing",
            },
          ],
        }),
      })
    ).rejects.toThrow(PublishValidationFailedError);

    expect(store.deals.get(DEAL_ID)?.status).toBe("auto_paused");
  });

  it("stubValidateForPublish returns ok", () => {
    expect(stubValidateForPublish(makeDealFixture({ id: DEAL_ID, operatorId: OPERATOR_ID })).ok).toBe(
      true
    );
  });
});

describe("client update ignores status / pause_*", () => {
  it("stripSystemOwnedDealFields removes status and pause fields", () => {
    const stripped = stripSystemOwnedDealFields({
      title: "Harbour Kayak Morning",
      status: "live",
      pauseReason: "operator",
      pauseDetail: "nope",
      summary: "A morning paddle on the harbour",
    });
    expect(stripped).toEqual({
      title: "Harbour Kayak Morning",
      summary: "A morning paddle on the harbour",
    });
    expect("status" in stripped).toBe(false);
    expect("pauseReason" in stripped).toBe(false);
    expect("pauseDetail" in stripped).toBe(false);
  });

  it("applyClientDealFieldPatch ignores client status changes", () => {
    const deal = makeDealFixture({
      id: DEAL_ID,
      operatorId: OPERATOR_ID,
      status: "draft",
      title: "Old title xx",
    });
    const patched = applyClientDealFieldPatch(deal, {
      title: "Harbour Kayak Morning",
      status: "live",
      pauseReason: "operator",
      pauseDetail: "hacked",
    });

    expect(patched.title).toBe("Harbour Kayak Morning");
    expect(patched.status).toBe("draft");
    expect(patched.pauseReason).toBeNull();
    expect(patched.pauseDetail).toBeNull();
  });
});

describe("eventTypeForTransition coverage", () => {
  it("maps rejected and published correctly", () => {
    expect(eventTypeForTransition("pending_review", "draft")).toBe("rejected");
    expect(eventTypeForTransition("draft", "live")).toBe("published");
    expect(eventTypeForTransition("sold_out", "live")).toBe("resumed");
    expect(eventTypeForTransition("paused", "scheduled")).toBe("resumed");
    expect(eventTypeForTransition("auto_paused", "live")).toBe("auto_resumed");
    expect(eventTypeForTransition("draft", "scheduled")).toBe("scheduled");
  });

  it("knows every deal status for matrix completeness", () => {
    expect(DEAL_STATUSES).toContain("archived");
    expect(isAllowedDealTransition("archived", "ended")).toBe(false);
  });
});
