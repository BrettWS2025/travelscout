/**
 * Chunk 39 — Notifications: prefs, mandatory channels, notify fan-out, daily job.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import {
  applyAutoPause,
  makeDealFixture,
} from "@/lib/marketplace/deal-status";
import {
  sendDealAutoPaused,
  setSendDealAutoPaused,
} from "@/lib/marketplace/deal-integrated-sync-hooks";
import {
  DAILY_SUMMARY_LOCAL_HOUR,
  clearNotificationIncident,
  getMyNotificationPreferences,
  listMyInAppNotifications,
  listNotificationDeliveries,
  markInAppNotificationRead,
  notify,
  notifyDealAutoPaused,
  patchMyNotificationPreference,
  runDailyPerformanceSummaryJob,
  seedNotificationPreferences,
  setMemberContactResolver,
  setNotificationChannelProviders,
  serializeNotificationPreference,
  NotificationError,
} from "@/lib/marketplace/notifications";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { zonedLocalToUtcIso } from "@/lib/marketplace/timezone";

const NOW = "2026-10-21T04:00:00.000Z";

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  seedNotificationPreferences(store, seeded.notificationPreferences);
  return {
    store,
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    ownerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    managerId: DEV_SEED_IDS.harbourKayaks.managerUserId,
    staffId: DEV_SEED_IDS.harbourKayaks.staffUserId,
  };
}

describe("Chunk 39 notification preferences", () => {
  it("returns defaults for every event type", () => {
    const { store, operatorId, ownerId } = freshStore();
    const prefs = getMyNotificationPreferences(store, operatorId, ownerId, {
      now: NOW,
    });
    expect(prefs).toHaveLength(9);
    expect(prefs.find((p) => p.eventType === "deal_auto_paused")).toMatchObject({
      email: true,
      sms: false,
      inApp: true,
    });
    expect(
      serializeNotificationPreference(prefs[0]!).mandatory
    ).toBeTypeOf("boolean");
  });

  it("rejects turning off the last channel on deal_auto_paused", () => {
    const { store, operatorId, ownerId } = freshStore();
    // Turn off email first (in_app still on)
    patchMyNotificationPreference(
      store,
      operatorId,
      ownerId,
      { event_type: "deal_auto_paused", email: false },
      { now: NOW }
    );
    expect(() =>
      patchMyNotificationPreference(
        store,
        operatorId,
        ownerId,
        { event_type: "deal_auto_paused", in_app: false },
        { now: NOW }
      )
    ).toThrow(NotificationError);

    try {
      patchMyNotificationPreference(
        store,
        operatorId,
        ownerId,
        { event_type: "deal_auto_paused", in_app: false },
        { now: NOW }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(NotificationError);
      expect((err as NotificationError).message).toMatch(/at least one channel/i);
    }
  });

  it("allows turning off all channels on non-mandatory deal_lifecycle", () => {
    const { store, operatorId, ownerId } = freshStore();
    const updated = patchMyNotificationPreference(
      store,
      operatorId,
      ownerId,
      {
        event_type: "deal_lifecycle",
        email: false,
        sms: false,
        in_app: false,
      },
      { now: NOW }
    );
    expect(updated).toMatchObject({
      email: false,
      sms: false,
      inApp: false,
    });
  });
});

describe("Chunk 39 notify fan-out", () => {
  const emails: Array<{ to: string; subject: string }> = [];
  const smses: Array<{ to: string; body: string }> = [];

  beforeEach(() => {
    emails.length = 0;
    smses.length = 0;
    setNotificationChannelProviders({
      sendEmail: (msg) => {
        emails.push({ to: msg.to, subject: msg.subject });
      },
      sendSms: (msg) => {
        smses.push({ to: msg.to, body: msg.body });
      },
    });
    setMemberContactResolver((m) => ({
      email: m.invitedEmail,
      phone: m.userId?.endsWith("12") ? "+64210000012" : null, // manager only
    }));
  });

  afterEach(() => {
    setNotificationChannelProviders(null);
    setMemberContactResolver(null);
  });

  it("sends only on chosen channels for deal_auto_paused", async () => {
    const { store, operatorId, ownerId, managerId, staffId } = freshStore();

    // Owner: email + in_app (default). Manager: turn off email, keep in_app.
    // Staff: turn off in_app, keep email only... wait staff default is email+in_app.
    // Make staff email-only.
    patchMyNotificationPreference(
      store,
      operatorId,
      managerId,
      { event_type: "deal_auto_paused", email: false, in_app: true },
      { now: NOW }
    );
    patchMyNotificationPreference(
      store,
      operatorId,
      staffId,
      { event_type: "deal_auto_paused", email: true, in_app: false },
      { now: NOW }
    );

    const result = await notifyDealAutoPaused(store, {
      operatorId,
      dealId: "deal-1",
      reason: "session_cancelled",
      detail: "Session cancelled in provider",
      at: NOW,
    });

    expect(result.skipped).toBe(false);

    const deliveries = listNotificationDeliveries(store, {
      operatorId,
      eventType: "deal_auto_paused",
    });

    // Owner: email + in_app
    expect(
      deliveries.filter((d) => d.userId === ownerId).map((d) => d.channel).sort()
    ).toEqual(["email", "in_app"]);
    // Manager: in_app only
    expect(
      deliveries.filter((d) => d.userId === managerId).map((d) => d.channel)
    ).toEqual(["in_app"]);
    // Staff: email only
    expect(
      deliveries.filter((d) => d.userId === staffId).map((d) => d.channel)
    ).toEqual(["email"]);

    expect(emails.length).toBe(2); // owner + staff
    expect(smses.length).toBe(0); // deal_auto_paused default sms=false

    const inbox = listMyInAppNotifications(store, operatorId, ownerId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.title).toMatch(/Paused Automatically/i);

    const read = markInAppNotificationRead(
      store,
      operatorId,
      ownerId,
      inbox[0]!.id,
      { now: NOW }
    );
    expect(read.readAt).toBe(NOW);
  });

  it("dedupes by incidentKey", async () => {
    const { store, operatorId } = freshStore();
    const first = await notify(
      store,
      operatorId,
      "integration_sync_failing",
      { detail: "stale" },
      { now: NOW, incidentKey: "inc-1" }
    );
    expect(first.skipped).toBe(false);

    const second = await notify(
      store,
      operatorId,
      "integration_sync_failing",
      { detail: "stale again" },
      { now: NOW, incidentKey: "inc-1" }
    );
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("incident_deduped");

    clearNotificationIncident(store, "inc-1");
    const third = await notify(
      store,
      operatorId,
      "integration_sync_failing",
      { detail: "new incident" },
      { now: NOW, incidentKey: "inc-1" }
    );
    expect(third.skipped).toBe(false);
  });

  it("auto-pause via sendDealAutoPaused lands on notify channels", async () => {
    const { store, operatorId, ownerId } = freshStore();
    setSendDealAutoPaused(null);

    const deal = makeDealFixture({
      id: "live-deal",
      operatorId,
      status: "live",
      title: "Harbour paddle",
    });
    store.deals.set(deal.id, deal);

    applyAutoPause(
      { deals: store.deals, audit: store.audit },
      deal.id,
      "session_cancelled",
      "No sessions left",
      { actor: { type: "system" }, now: NOW }
    );

    await sendDealAutoPaused(store, {
      operatorId,
      dealId: deal.id,
      reason: "session_cancelled",
      detail: "No sessions left",
      at: NOW,
    });

    const deliveries = listNotificationDeliveries(store, {
      eventType: "deal_auto_paused",
      userId: ownerId,
    });
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.some((d) => d.channel === "email")).toBe(true);
    expect(deliveries.some((d) => d.channel === "in_app")).toBe(true);
  });
});

describe("Chunk 39 daily performance summary", () => {
  beforeEach(() => {
    setNotificationChannelProviders({
      sendEmail: () => undefined,
      sendSms: () => undefined,
    });
    setMemberContactResolver((m) => ({
      email: m.invitedEmail,
      phone: null,
    }));
  });

  afterEach(() => {
    setNotificationChannelProviders(null);
    setMemberContactResolver(null);
  });

  it("sends once at operator morning local time", async () => {
    const { store, operatorId } = freshStore();
    const op = store.operators.operators.get(operatorId)!;
    expect(op.timezone).toBe("Pacific/Auckland");

    // Pick a UTC instant that is 08:00 in Pacific/Auckland on a known day.
    // NZDT (Oct): UTC+13 → 08:00 NZDT = 19:00 previous day UTC.
    const morning = zonedLocalToUtcIso("2026-10-21", "08:00:00", "Pacific/Auckland");
    const partsHour = new Date(morning);
    // Sanity: job uses getZonedParts hour === DAILY_SUMMARY_LOCAL_HOUR
    expect(DAILY_SUMMARY_LOCAL_HOUR).toBe(8);

    const first = await runDailyPerformanceSummaryJob(store, {
      now: morning,
    });
    expect(first.sentOperatorIds).toContain(operatorId);

    const second = await runDailyPerformanceSummaryJob(store, {
      now: morning,
    });
    expect(second.sentOperatorIds).not.toContain(operatorId);

    // Wrong hour → skip
    const afternoon = zonedLocalToUtcIso(
      "2026-10-21",
      "15:00:00",
      "Pacific/Auckland"
    );
    const third = await runDailyPerformanceSummaryJob(store, {
      now: afternoon,
    });
    expect(third.sentOperatorIds).not.toContain(operatorId);

    void partsHour;
  });
});
