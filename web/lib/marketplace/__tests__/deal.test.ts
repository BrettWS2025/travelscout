import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEAL_FIELD_LIMITS,
  PROMO_CODE_REGEX,
  assertValidDealFields,
  plainTextFromHtml,
  sanitizeDealDescription,
  validateDealFields,
} from "@/lib/marketplace/deal";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261019000002_create_deals_table.sql"
);

const L = DEAL_FIELD_LIMITS;

function repeat(ch: string, n: number): string {
  return ch.repeat(n);
}

describe("Chunk 3 migration", () => {
  it("defines marketplace.operator_deals (not legacy deals) with indexes and slug unique", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.operator_deals");
    expect(sql).not.toMatch(/CREATE TABLE marketplace\.deals\s*\(/);
    expect(sql).toContain("idx_marketplace_operator_deals_operator_status");
    expect(sql).toContain("idx_marketplace_operator_deals_integration_status");
    expect(sql).toMatch(/slug TEXT NOT NULL UNIQUE/);
    expect(sql).toContain("REFERENCES marketplace.operators(id)");
    expect(sql).toContain("'draft', 'pending_review', 'scheduled', 'live'");
    expect(sql).toContain("promo_code ~ '^[A-Z0-9_-]+$'");
    expect(sql).toContain("operator_deals_highlights_max");
    expect(sql).not.toContain("NOT EXISTS");
    expect(sql).toContain("Members can view operator deals");
    expect(sql).toContain("does not collide with the existing");
  });
});

describe("sanitizeDealDescription", () => {
  it("keeps bold, lists and safe links; strips scripts and other tags", () => {
    const raw =
      '<p><strong>Hello</strong></p><ul><li>One</li></ul>' +
      '<a href="https://example.com">Go</a>' +
      '<script>alert(1)</script><em>nope</em>' +
      '<a href="javascript:alert(1)">bad</a>';

    const cleaned = sanitizeDealDescription(raw);
    expect(cleaned).toContain("<strong>Hello</strong>");
    expect(cleaned).toContain("<ul>");
    expect(cleaned).toContain('<a href="https://example.com">');
    expect(cleaned).not.toContain("script");
    expect(cleaned).not.toContain("<em>");
    expect(cleaned).not.toContain("javascript:");
  });

  it("plainTextFromHtml strips tags for length measurement", () => {
    expect(plainTextFromHtml("<p><b>Hello</b> world</p>")).toBe("Hello world");
  });
});

describe("validateDealFields — length limits", () => {
  it("allows null / omitted publish-required fields (incomplete draft)", () => {
    expect(validateDealFields({})).toEqual([]);
    expect(
      validateDealFields({
        title: null,
        summary: null,
        description: null,
        category: null,
      })
    ).toEqual([]);
  });

  it("enforces title 10–80", () => {
    expect(
      validateDealFields({ title: repeat("a", L.titleMin - 1) })
    ).toEqual([expect.objectContaining({ field: "title" })]);
    expect(
      validateDealFields({ title: repeat("a", L.titleMax + 1) })
    ).toEqual([expect.objectContaining({ field: "title" })]);
    expect(
      validateDealFields({ title: repeat("a", L.titleMin) })
    ).toEqual([]);
    expect(
      validateDealFields({ title: repeat("a", L.titleMax) })
    ).toEqual([]);
  });

  it("enforces summary 20–160", () => {
    expect(
      validateDealFields({ summary: repeat("b", L.summaryMin - 1) })
    ).toEqual([expect.objectContaining({ field: "summary" })]);
    expect(
      validateDealFields({ summary: repeat("b", L.summaryMax + 1) })
    ).toEqual([expect.objectContaining({ field: "summary" })]);
    expect(
      validateDealFields({ summary: repeat("b", L.summaryMin) })
    ).toEqual([]);
  });

  it("enforces description plain-text 100–5000 after sanitize", () => {
    const tooShort = `<p>${repeat("c", L.descriptionMin - 1)}</p>`;
    expect(validateDealFields({ description: tooShort })).toEqual([
      expect.objectContaining({ field: "description" }),
    ]);

    const ok = `<p><strong>${repeat("d", L.descriptionMin)}</strong></p>`;
    expect(validateDealFields({ description: ok })).toEqual([]);

    const tooLong = repeat("e", L.descriptionMax + 1);
    expect(validateDealFields({ description: tooLong })).toEqual([
      expect.objectContaining({ field: "description" }),
    ]);
  });

  it("enforces meeting_point_notes / pickup_notes / accessibility_notes ≤500", () => {
    const over = repeat("x", 501);
    expect(
      validateDealFields({
        meetingPointNotes: over,
        pickupNotes: over,
        accessibilityNotes: over,
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining([
        "meeting_point_notes",
        "pickup_notes",
        "accessibility_notes",
      ])
    );
  });

  it("enforces cancellation_policy_text and important_info ≤1000", () => {
    const over = repeat("y", 1001);
    expect(
      validateDealFields({
        cancellationPolicyText: over,
        importantInfo: over,
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining([
        "cancellation_policy_text",
        "important_info",
      ])
    );
  });

  it("enforces booking_instructions ≤300", () => {
    expect(
      validateDealFields({ bookingInstructions: repeat("z", 301) })
    ).toEqual([expect.objectContaining({ field: "booking_instructions" })]);
  });
});

describe("validateDealFields — array limits", () => {
  it("enforces tags max 10", () => {
    expect(
      validateDealFields({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })
    ).toEqual([expect.objectContaining({ field: "tags" })]);
    expect(
      validateDealFields({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) })
    ).toEqual([]);
  });

  it("enforces highlights max 6 and each ≤80", () => {
    expect(
      validateDealFields({
        highlights: Array.from({ length: 7 }, (_, i) => `h${i}`) ,
      })
    ).toEqual([expect.objectContaining({ field: "highlights" })]);

    expect(
      validateDealFields({
        highlights: [repeat("h", L.highlightItemMax + 1)],
      })
    ).toEqual([expect.objectContaining({ field: "highlights[0]" })]);

    expect(
      validateDealFields({
        highlights: [repeat("h", L.highlightItemMax)],
      })
    ).toEqual([]);
  });

  it("enforces inclusions / exclusions / what_to_bring max 15", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => `i${i}`);
    expect(
      validateDealFields({
        inclusions: sixteen,
        exclusions: sixteen,
        whatToBring: sixteen,
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining(["inclusions", "exclusions", "what_to_bring"])
    );
  });
});

describe("validateDealFields — numeric ranges", () => {
  it("enforces duration_minutes 15–20160", () => {
    expect(validateDealFields({ durationMinutes: 14 })).toEqual([
      expect.objectContaining({ field: "duration_minutes" }),
    ]);
    expect(validateDealFields({ durationMinutes: 20161 })).toEqual([
      expect.objectContaining({ field: "duration_minutes" }),
    ]);
    expect(validateDealFields({ durationMinutes: 15 })).toEqual([]);
    expect(validateDealFields({ durationMinutes: 20160 })).toEqual([]);
  });

  it("enforces min_age 0–99", () => {
    expect(validateDealFields({ minAge: -1 })).toEqual([
      expect.objectContaining({ field: "min_age" }),
    ]);
    expect(validateDealFields({ minAge: 100 })).toEqual([
      expect.objectContaining({ field: "min_age" }),
    ]);
    expect(validateDealFields({ minAge: 0 })).toEqual([]);
    expect(validateDealFields({ minAge: 99 })).toEqual([]);
  });

  it("enforces seat_cap 1–999", () => {
    expect(validateDealFields({ seatCap: 0 })).toEqual([
      expect.objectContaining({ field: "seat_cap" }),
    ]);
    expect(validateDealFields({ seatCap: 1000 })).toEqual([
      expect.objectContaining({ field: "seat_cap" }),
    ]);
    expect(validateDealFields({ seatCap: 1 })).toEqual([]);
    expect(validateDealFields({ seatCap: 999 })).toEqual([]);
  });

  it("enforces sales_cutoff_minutes 0–1440", () => {
    expect(validateDealFields({ salesCutoffMinutes: -1 })).toEqual([
      expect.objectContaining({ field: "sales_cutoff_minutes" }),
    ]);
    expect(validateDealFields({ salesCutoffMinutes: 1441 })).toEqual([
      expect.objectContaining({ field: "sales_cutoff_minutes" }),
    ]);
    expect(validateDealFields({ salesCutoffMinutes: 0 })).toEqual([]);
    expect(validateDealFields({ salesCutoffMinutes: 1440 })).toEqual([]);
  });

  it("enforces latitude / longitude ranges", () => {
    expect(validateDealFields({ latitude: -91 })).toEqual([
      expect.objectContaining({ field: "latitude" }),
    ]);
    expect(validateDealFields({ longitude: 181 })).toEqual([
      expect.objectContaining({ field: "longitude" }),
    ]);
    expect(
      validateDealFields({ latitude: -36.8485, longitude: 174.7633 })
    ).toEqual([]);
  });
});

describe("validateDealFields — promo_code regex", () => {
  it("accepts valid A-Z 0-9 _ - codes of length 3–30", () => {
    // Regex is character-class only; length is enforced separately.
    expect(PROMO_CODE_REGEX.test("AB")).toBe(true);
    expect(PROMO_CODE_REGEX.test("ABC")).toBe(true);
    expect(PROMO_CODE_REGEX.test("DEAL_50-OFF")).toBe(true);
    expect(PROMO_CODE_REGEX.test("deal")).toBe(false);
    expect(PROMO_CODE_REGEX.test("BAD CODE")).toBe(false);

    expect(validateDealFields({ promoCode: "AB" })).toEqual([
      expect.objectContaining({
        field: "promo_code",
        message: "must be 3–30 characters",
      }),
    ]);
    expect(validateDealFields({ promoCode: "ABC" })).toEqual([]);
    expect(validateDealFields({ promoCode: "DEAL_50-OFF" })).toEqual([]);
    expect(validateDealFields({ promoCode: "lowercase" })).toEqual([
      expect.objectContaining({
        field: "promo_code",
        message: "must match ^[A-Z0-9_-]+$",
      }),
    ]);
    expect(validateDealFields({ promoCode: "HAS SPACE" })).toEqual([
      expect.objectContaining({ field: "promo_code" }),
    ]);
    expect(
      validateDealFields({ promoCode: repeat("A", L.promoCodeMax + 1) })
    ).toEqual([expect.objectContaining({ field: "promo_code" })]);
  });
});

describe("validateDealFields — enums, currency, languages", () => {
  it("rejects invalid enum values", () => {
    expect(
      validateDealFields({
        dealType: "nope" as never,
        category: "nope" as never,
        fitnessLevel: "nope" as never,
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining([
        "deal_type",
        "category",
        "fitness_level",
      ])
    );
  });

  it("enforces currency ISO 4217 (3 uppercase letters)", () => {
    expect(validateDealFields({ currency: "NZ" })).toEqual([
      expect.objectContaining({ field: "currency" }),
    ]);
    expect(validateDealFields({ currency: "nzd" })).toEqual([
      expect.objectContaining({ field: "currency" }),
    ]);
    expect(validateDealFields({ currency: "NZD" })).toEqual([]);
  });

  it("enforces ISO 639-1 languages", () => {
    expect(validateDealFields({ languages: ["en", "mi"] })).toEqual([]);
    expect(validateDealFields({ languages: ["EN"] })).toEqual([
      expect.objectContaining({ field: "languages[0]" }),
    ]);
    expect(validateDealFields({ languages: ["eng"] })).toEqual([
      expect.objectContaining({ field: "languages[0]" }),
    ]);
  });
});

describe("assertValidDealFields", () => {
  it("sanitizes description and throws DealValidationError on failure", () => {
    const ok = assertValidDealFields({
      title: repeat("a", 12),
      description: `<p>${repeat("d", 120)}</p><script>x</script>`,
    });
    expect(ok.description).not.toContain("script");

    expect(() =>
      assertValidDealFields({ title: "short" })
    ).toThrow(/title/);
  });
});
