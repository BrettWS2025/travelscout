import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  DEAL_STATUS_LABELS,
  DEAL_TYPE_LABELS,
  DISCOUNT_MECHANISM_LABELS,
  NOTIFICATION_EVENT_LABELS,
  statusLabel,
} from "@/lib/marketplace/display-labels";

describe("display-labels (layman Title Case)", () => {
  it("uses Title Case on option lists", () => {
    expect(CATEGORY_LABELS.food_wine).toBe("Food & Wine");
    expect(DEAL_STATUS_LABELS.auto_paused).toBe("Paused Automatically");
    expect(DEAL_STATUS_LABELS.pending_review).toBe("Awaiting Review");
    expect(DEAL_TYPE_LABELS.manual_session).toMatch(/Fixed Times/i);
    expect(DISCOUNT_MECHANISM_LABELS.promo_code).toBe("Discount Code");
  });

  it("formats unknown statuses in Title Case", () => {
    expect(statusLabel("auto_paused")).toBe("Paused Automatically");
    expect(statusLabel("some_new_status")).toBe("Some New Status");
  });

  it("plain-language notification event names", () => {
    expect(NOTIFICATION_EVENT_LABELS.attestation_due).toMatch(/Seat Reconfirm/i);
    expect(NOTIFICATION_EVENT_LABELS.deal_auto_paused).toMatch(
      /Paused Automatically/i
    );
  });
});
