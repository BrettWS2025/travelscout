import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEAL_EVENT_TYPES,
  DealEventAppendOnlyError,
  DealAuditValidationError,
  appendDealEvent,
  createClickEvent,
  createDealAttestation,
  createDealAuditStore,
  createDealTemplate,
  deleteDealEvent,
  deleteDealTemplate,
  listDealEvents,
  renameDealTemplate,
  updateDealEvent,
  upsertDealMetricDaily,
} from "@/lib/marketplace/deal-audit";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000003_create_deal_audit_tables.sql"
);

const DEAL_ID = "11111111-1111-1111-1111-111111111111";
const OPERATOR_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";

describe("Chunk 6 migration", () => {
  it("defines audit, attestation, click, metrics and template tables", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.deal_events");
    expect(sql).toContain("CREATE TABLE marketplace.deal_attestations");
    expect(sql).toContain("CREATE TABLE marketplace.click_events");
    expect(sql).toContain("CREATE TABLE marketplace.deal_metric_daily");
    expect(sql).toContain("CREATE TABLE marketplace.deal_templates");

    expect(sql).toContain(
      "REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE"
    );
    expect(sql).toContain(
      "REFERENCES marketplace.deal_sessions(id) ON DELETE SET NULL"
    );
    expect(sql).toContain(
      "REFERENCES marketplace.operators(id) ON DELETE CASCADE"
    );

    expect(sql).toContain("'created', 'updated', 'published'");
    expect(sql).toContain("'user', 'system', 'admin'");
    expect(sql).toContain("'dashboard', 'email_link', 'sms_link'");
    expect(sql).toContain("'available', 'sold_out', 'error'");
    expect(sql).toContain("UNIQUE (deal_id, date)");
    expect(sql).toContain("click_id TEXT NOT NULL UNIQUE");

    expect(sql).toContain("prevent_deal_event_mutation");
    expect(sql).toContain("deal_events is append-only");
    expect(sql).toContain("marketplace_deal_events_no_update");
    expect(sql).toContain("marketplace_deal_events_no_delete");

    // Append-only grants: SELECT + INSERT, no UPDATE/DELETE on deal_events
    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON marketplace\.deal_events/
    );
    expect(sql).not.toMatch(
      /GRANT[^;]*UPDATE[^;]*DELETE[^;]*ON marketplace\.deal_events/
    );

    expect(sql).toContain("marketplace.operator_id_for_deal");
  });
});

describe("DEAL_EVENT_TYPES", () => {
  it("includes every event_type from the chunk / migration", () => {
    expect(DEAL_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "created",
        "published",
        "auto_paused",
        "auto_resumed",
        "attested",
        "link_broken",
        "link_ok",
        "price_changed",
        "seats_changed",
      ])
    );
    expect(DEAL_EVENT_TYPES).toHaveLength(22);
  });
});

describe("appendDealEvent — append-only", () => {
  it("inserts events and lists them by deal", () => {
    const store = createDealAuditStore();
    const a = appendDealEvent(store, {
      dealId: DEAL_ID,
      eventType: "created",
      actorType: "user",
      actorId: "user-1",
      detail: {},
    });
    const b = appendDealEvent(store, {
      dealId: DEAL_ID,
      eventType: "published",
      actorType: "system",
      detail: { from_status: "draft", to_status: "live" },
    });

    expect(a.id).toBeTruthy();
    expect(b.detail).toEqual({ from_status: "draft", to_status: "live" });
    expect(listDealEvents(store, DEAL_ID)).toHaveLength(2);
  });

  it("rejects update through the model/service", () => {
    const store = createDealAuditStore();
    const event = appendDealEvent(store, {
      dealId: DEAL_ID,
      eventType: "created",
      actorType: "user",
    });

    expect(() =>
      updateDealEvent(store, event.id, { eventType: "updated" })
    ).toThrow(DealEventAppendOnlyError);
    expect(() =>
      updateDealEvent(store, event.id, { eventType: "updated" })
    ).toThrow(/append-only.*update/i);

    // Row unchanged
    expect(store.events.get(event.id)?.eventType).toBe("created");
  });

  it("rejects delete through the model/service", () => {
    const store = createDealAuditStore();
    const event = appendDealEvent(store, {
      dealId: DEAL_ID,
      eventType: "paused",
      actorType: "user",
      detail: { reason: "operator" },
    });

    expect(() => deleteDealEvent(store, event.id)).toThrow(
      DealEventAppendOnlyError
    );
    expect(() => deleteDealEvent(store, event.id)).toThrow(
      /append-only.*delete/i
    );
    expect(store.events.has(event.id)).toBe(true);
  });

  it("validates event_type and actor_type", () => {
    const store = createDealAuditStore();
    expect(() =>
      appendDealEvent(store, {
        dealId: DEAL_ID,
        eventType: "nope" as never,
        actorType: "user",
      })
    ).toThrow(DealAuditValidationError);

    expect(() =>
      appendDealEvent(store, {
        dealId: DEAL_ID,
        eventType: "created",
        actorType: "bot" as never,
      })
    ).toThrow(/actor_type/);
  });
});

describe("DealAttestation", () => {
  it("stores seats_by_session map and method", () => {
    const store = createDealAuditStore();
    const row = createDealAttestation(store, {
      dealId: DEAL_ID,
      method: "dashboard",
      attestedBy: "user-1",
      seatsBySession: { [SESSION_ID]: 4 },
    });

    expect(row.method).toBe("dashboard");
    expect(row.seatsBySession[SESSION_ID]).toBe(4);
    expect(row.attestedBy).toBe("user-1");
  });

  it("allows null attested_by for token-based methods", () => {
    const store = createDealAuditStore();
    const row = createDealAttestation(store, {
      dealId: DEAL_ID,
      method: "email_link",
      seatsBySession: { [SESSION_ID]: 2 },
    });
    expect(row.attestedBy).toBeNull();
    expect(row.method).toBe("email_link");
  });

  it("rejects seats outside 0–999", () => {
    const store = createDealAuditStore();
    expect(() =>
      createDealAttestation(store, {
        dealId: DEAL_ID,
        method: "sms_link",
        seatsBySession: { [SESSION_ID]: 1000 },
      })
    ).toThrow(/seats_by_session/);
  });
});

describe("ClickEvent", () => {
  it("enforces unique click_id", () => {
    const store = createDealAuditStore();
    createClickEvent(store, {
      dealId: DEAL_ID,
      clickId: "clk_1",
      dealSessionId: SESSION_ID,
      visitorId: "v1",
      recheckResult: "available",
      redirectUrl: "https://book.example.com/?x=1",
    });

    expect(() =>
      createClickEvent(store, {
        dealId: DEAL_ID,
        clickId: "clk_1",
      })
    ).toThrow(/click_id must be unique/);
  });

  it("accepts sold_out and error recheck results", () => {
    const store = createDealAuditStore();
    const a = createClickEvent(store, {
      dealId: DEAL_ID,
      clickId: "clk_2",
      recheckResult: "sold_out",
    });
    const b = createClickEvent(store, {
      dealId: DEAL_ID,
      clickId: "clk_3",
      recheckResult: "error",
    });
    expect(a.recheckResult).toBe("sold_out");
    expect(b.recheckResult).toBe("error");
  });
});

describe("DealMetricDaily", () => {
  it("upserts uniquely on (deal_id, date)", () => {
    const store = createDealAuditStore();
    const first = upsertDealMetricDaily(store, {
      dealId: DEAL_ID,
      date: "2026-10-20",
      impressions: 10,
      detailViews: 3,
      bookingClicks: 1,
    });
    const second = upsertDealMetricDaily(store, {
      dealId: DEAL_ID,
      date: "2026-10-20",
      impressions: 15,
      bookingClicks: 2,
    });

    expect(second.id).toBe(first.id);
    expect(second.impressions).toBe(15);
    expect(second.detailViews).toBe(3); // preserved when omitted
    expect(second.bookingClicks).toBe(2);
    expect(
      [...store.metrics.values()].filter(
        (m) => m.dealId === DEAL_ID && m.date === "2026-10-20"
      )
    ).toHaveLength(1);
  });

  it("rejects invalid date and negative counters", () => {
    const store = createDealAuditStore();
    expect(() =>
      upsertDealMetricDaily(store, {
        dealId: DEAL_ID,
        date: "20-10-2026",
      })
    ).toThrow(/date/);
    expect(() =>
      upsertDealMetricDaily(store, {
        dealId: DEAL_ID,
        date: "2026-10-20",
        impressions: -1,
      })
    ).toThrow(/impressions/);
  });
});

describe("DealTemplate", () => {
  it("creates, renames and deletes templates", () => {
    const store = createDealAuditStore();
    const t = createDealTemplate(store, {
      operatorId: OPERATOR_ID,
      name: "Harbour kayak half-day",
      payload: { title: "Kayak", deal_type: "manual_session" },
    });
    expect(t.payload.title).toBe("Kayak");

    const renamed = renameDealTemplate(store, t.id, "Kayak template");
    expect(renamed.name).toBe("Kayak template");

    deleteDealTemplate(store, t.id);
    expect(store.templates.has(t.id)).toBe(false);
  });

  it("rejects empty name", () => {
    const store = createDealAuditStore();
    expect(() =>
      createDealTemplate(store, { operatorId: OPERATOR_ID, name: "  " })
    ).toThrow(/name/);
  });
});
