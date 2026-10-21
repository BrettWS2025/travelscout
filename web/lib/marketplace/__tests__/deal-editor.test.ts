import { describe, expect, it } from "vitest";
import {
  charCounter,
  clientPriceRowStatus,
  dollarsToMinor,
  EDITOR_STEP_LABELS,
  EDITOR_STEPS,
  formatMinorAsDollars,
  nextEditorStep,
  summarizeDealEditor,
} from "@/lib/marketplace/deal-editor";
import type { DealDetail } from "@/lib/marketplace/deal-draft";
import type { DealPriceOption } from "@/lib/marketplace/deal-session";
import { makeDealFixture } from "@/lib/marketplace/deal-status";

describe("deal-editor helpers (chunk 22)", () => {
  it("exposes all seven editor steps with labels", () => {
    expect(EDITOR_STEPS).toEqual([
      "type",
      "content",
      "images",
      "pricing",
      "availability",
      "destination",
      "review",
    ]);
    expect(EDITOR_STEP_LABELS.pricing).toBe("Pricing");
    expect(nextEditorStep("content")).toBe("images");
    expect(nextEditorStep("review")).toBeNull();
  });

  it("mirrors 50% rule client-side for price rows", () => {
    const pass = clientPriceRowStatus(20000, 10000);
    expect(pass.passes).toBe(true);
    expect(pass.discountPct).toBe(50);
    expect(pass.maxDealPriceMinor).toBe(10000);

    const fail = clientPriceRowStatus(20000, 11000);
    expect(fail.passes).toBe(false);
    expect(fail.maxDealPriceMinor).toBe(10000);
  });

  it("formats money helpers", () => {
    expect(formatMinorAsDollars(9050)).toBe("$90.50");
    expect(dollarsToMinor("90.50")).toBe(9050);
    expect(dollarsToMinor("")).toBeNull();
  });

  it("character counters match field limits", () => {
    const short = charCounter("hi", 10, 80);
    expect(short.ok).toBe(false);
    expect(short.label).toBe("2/80");
    const ok = charCounter("Harbour Kayak Adventure", 10, 80);
    expect(ok.ok).toBe(true);
  });

  it("summary picks lowest deal price and failing checklist steps", () => {
    const deal = makeDealFixture({
      id: "d1",
      title: "Test deal title long enough",
    });
    const options: DealPriceOption[] = [
      {
        id: "p1",
        dealId: "d1",
        label: "Adult",
        type: "adult",
        externalPriceOptionId: null,
        externalDealPriceOptionId: null,
        originalPriceMinor: 20000,
        originalPriceSource: "operator_entered",
        originalPriceEvidenceUrl: null,
        dealPriceMinor: 9000,
        discountPct: 55,
        sortOrder: 0,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
      },
      {
        id: "p2",
        dealId: "d1",
        label: "Child",
        type: "child",
        externalPriceOptionId: null,
        externalDealPriceOptionId: null,
        originalPriceMinor: 10000,
        originalPriceSource: "operator_entered",
        originalPriceEvidenceUrl: null,
        dealPriceMinor: 4000,
        discountPct: 60,
        sortOrder: 1,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
      },
    ];
    const detail = {
      deal,
      sessions: [],
      priceOptions: options,
      discountSteps: [],
      media: [],
      validation: {
        ok: false,
        checks: [
          {
            key: "min_discount",
            label: "Minimum discount",
            passed: false,
            message: "Option Adult fails",
            editorStep: "pricing" as const,
          },
          {
            key: "images",
            label: "Images",
            passed: true,
            editorStep: "images" as const,
          },
        ],
      },
      publish_button: "Publish" as const,
      provider_values: null,
      overridden_fields: [],
      provider_price_options: null,
      discount_verification: null,
    } satisfies DealDetail;

    const summary = summarizeDealEditor(detail);
    expect(summary.lowestDealMinor).toBe(4000);
    expect(summary.discountPct).toBe(60);
    expect(summary.validationOk).toBe(false);
    expect(summary.failingChecks).toHaveLength(1);
    expect(summary.failingChecks[0].editorStep).toBe("pricing");
  });
});
