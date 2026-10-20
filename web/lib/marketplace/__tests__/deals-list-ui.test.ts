import { describe, expect, it } from "vitest";
import type { DealListRow } from "@/lib/marketplace/deal-list";
import {
  buildDealsListQuery,
  canWriteInventory,
  DEFAULT_DEALS_LIST_FILTERS,
  emptyStateCopy,
  formatCutoffCountdown,
  pauseTooltip,
} from "@/lib/marketplace/deals-list-ui";

function row(partial: Partial<DealListRow> = {}): DealListRow {
  return {
    id: "d1",
    cover_thumbnail_url: null,
    title: "Harbour paddle",
    deal_type: "manual_session",
    source_provider: "manual",
    from_rule: false,
    next_session_start_at: null,
    next_session_start_local: null,
    original_price_minor: 20000,
    deal_price_minor: 9000,
    discount_pct: 55,
    seats_displayed: 4,
    cutoff_at: null,
    status: "live",
    pause_reason: null,
    pause_detail: null,
    clicks_today: 0,
    allowed_actions: ["preview", "view_stats"],
    ...partial,
  };
}

describe("deals-list-ui helpers (chunk 23)", () => {
  it("builds list query with tab and filters", () => {
    const qs = buildDealsListQuery({
      ...DEFAULT_DEALS_LIST_FILTERS,
      tab: "paused",
      dealType: "manual_session",
      search: "kayak",
      page: 2,
    });
    const params = new URLSearchParams(qs);
    expect(params.get("tab")).toBe("paused");
    expect(params.get("deal_type")).toBe("manual_session");
    expect(params.get("search")).toBe("kayak");
    expect(params.get("page")).toBe("2");
    expect(params.get("sort")).toBe("next_session");
  });

  it("formats cutoff countdown and past cutoff", () => {
    const now = Date.parse("2026-10-20T12:00:00.000Z");
    expect(formatCutoffCountdown(null, now)).toBe("—");
    expect(
      formatCutoffCountdown("2026-10-20T11:59:00.000Z", now)
    ).toBe("Cutoff passed");
    expect(
      formatCutoffCountdown("2026-10-20T14:30:00.000Z", now)
    ).toBe("2h 30m");
    expect(
      formatCutoffCountdown("2026-10-20T12:05:10.000Z", now)
    ).toBe("5m 10s");
  });

  it("builds pause tooltip from reason and detail", () => {
    expect(pauseTooltip(row())).toBeNull();
    expect(
      pauseTooltip(
        row({ pause_reason: "operator", pause_detail: "Taking a break" })
      )
    ).toBe("Paused by operator: Taking a break");
    expect(
      pauseTooltip(row({ pause_reason: "attestation_expired" }))
    ).toBe("Seats not reconfirmed");
  });

  it("gates write UI by role", () => {
    expect(canWriteInventory("owner")).toBe(true);
    expect(canWriteInventory("manager")).toBe(true);
    expect(canWriteInventory("staff")).toBe(false);
    expect(canWriteInventory(null)).toBe(false);
  });

  it("empty state prompts create + connect when no deals/integration", () => {
    const empty = emptyStateCopy({
      hasAnyDeals: false,
      hasIntegration: false,
      canWrite: true,
    });
    expect(empty.title).toMatch(/first deal/i);
    expect(empty.cta).toBe("Create deal");
    expect(empty.body).toMatch(/connect/i);

    const staff = emptyStateCopy({
      hasAnyDeals: false,
      hasIntegration: false,
      canWrite: false,
    });
    expect(staff.cta).toBeNull();
  });
});
