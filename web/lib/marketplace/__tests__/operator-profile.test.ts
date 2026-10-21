/**
 * Chunk 38 — Business profile and deal defaults.
 */

import { describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { buildSolidPng } from "@/lib/marketplace/image-dimensions";
import { createMemoryMediaStorage } from "@/lib/marketplace/media-storage";
import {
  BOOKING_DEFAULTS_NOTE,
  bookingDefaultsResponse,
  getOperatorBookingDefaults,
  getOperatorPreview,
  getOperatorProfile,
  serializeOperator,
  serializeOperatorPreview,
  updateOperatorBookingDefaults,
  updateOperatorProfile,
  uploadOperatorProfileImage,
} from "@/lib/marketplace/operator-profile";
import {
  OperatorValidationError,
  isValidIanaTimezone,
  validateOperatorFields,
} from "@/lib/marketplace/operators";
import { permissionUserFromStore } from "@/lib/marketplace/permissions";
import {
  requireDefaultsAccess,
  requireProfileRead,
  requireProfileWrite,
} from "@/lib/marketplace/operator-profile";
import { DealDraftError } from "@/lib/marketplace/deal-draft";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-21T04:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
};

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  return {
    store,
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    ownerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    staffId: DEV_SEED_IDS.harbourKayaks.staffUserId,
    managerId: DEV_SEED_IDS.harbourKayaks.managerUserId,
  };
}

describe("Chunk 38 profile validation", () => {
  it("rejects short/long description over limits, bad URL, phone, timezone, currency, language, region", () => {
    const errors = validateOperatorFields({
      legalName: "A Ltd",
      tradingName: "A",
      slug: "a",
      shortDescription: "x".repeat(161),
      longDescription: "y".repeat(3001),
      website: "http://insecure.example",
      publicEmail: "not-an-email",
      publicPhone: "0211234567",
      timezone: "Not/A_Zone",
      currency: "nzd",
      languages: ["EN", "zz1"],
      regionsServed: ["Atlantis"],
    });
    expect(errors.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        "short_description",
        "long_description",
        "website",
        "public_email",
        "public_phone",
        "timezone",
        "currency",
        "languages[0]",
        "regions_served[0]",
      ])
    );
  });

  it("accepts valid IANA timezones", () => {
    expect(isValidIanaTimezone("Pacific/Auckland")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("Fake/Zone")).toBe(false);
  });
});

describe("Chunk 38 permissions", () => {
  it("staff can read profile but not write or edit defaults", () => {
    const { store, operatorId, staffId, ownerId } = freshStore();
    const members = [...store.operators.teamMembers.values()];
    const staff = permissionUserFromStore(staffId, members);
    const owner = permissionUserFromStore(ownerId, members);

    expect(() => requireProfileRead(staff, operatorId)).not.toThrow();
    expect(() => requireProfileWrite(staff, operatorId)).toThrow(DealDraftError);
    expect(() => requireDefaultsAccess(staff, operatorId)).toThrow(
      DealDraftError
    );
    expect(() => requireProfileWrite(owner, operatorId)).not.toThrow();
    expect(() => requireDefaultsAccess(owner, operatorId)).not.toThrow();
  });
});

describe("Chunk 38 profile get/patch", () => {
  it("updates profile fields and strips admin-only for non-admins", () => {
    const { store, operatorId } = freshStore();
    const before = getOperatorProfile(store, operatorId);
    expect(before.requiresManualReview).toBe(false);

    const updated = updateOperatorProfile(
      store,
      operatorId,
      {
        trading_name: "Harbour Kayaks NZ",
        short_description: "Last-minute kayak deals on the harbour.",
        website: "https://harbour-kayaks.example",
        public_email: "hello@harbour-kayaks.example",
        public_phone: "+64211234567",
        timezone: "Pacific/Auckland",
        currency: "NZD",
        languages: ["en"],
        regions_served: ["Auckland"],
        account_status: "suspended",
        requires_manual_review: true,
      },
      { now: NOW, isPlatformAdmin: false }
    );

    expect(updated.tradingName).toBe("Harbour Kayaks NZ");
    expect(updated.shortDescription).toContain("kayak");
    expect(updated.accountStatus).toBe(before.accountStatus);
    expect(updated.requiresManualReview).toBe(false);

    const serialized = serializeOperator(updated);
    expect(serialized.trading_name).toBe("Harbour Kayaks NZ");
    expect(serialized.account_status).toBe(before.accountStatus);
  });

  it("platform admin can set requires_manual_review", () => {
    const { store, operatorId } = freshStore();
    const updated = updateOperatorProfile(
      store,
      operatorId,
      { requires_manual_review: true },
      { now: NOW, isPlatformAdmin: true }
    );
    expect(updated.requiresManualReview).toBe(true);
  });

  it("preview omits internal contacts and admin flags", () => {
    const { store, operatorId } = freshStore();
    updateOperatorProfile(
      store,
      operatorId,
      {
        internal_email: "ops@harbour-kayaks.example",
        public_email: "hello@harbour-kayaks.example",
      },
      { now: NOW }
    );
    const preview = serializeOperatorPreview(getOperatorPreview(store, operatorId));
    expect(preview.public_email).toBe("hello@harbour-kayaks.example");
    expect(preview).not.toHaveProperty("internal_email");
    expect(preview).not.toHaveProperty("account_status");
    expect(preview).not.toHaveProperty("requires_manual_review");
  });
});

describe("Chunk 38 booking defaults → new deals only", () => {
  it("change default cutoff to 120 → new deal has 120, old deals unchanged", () => {
    const { store, operatorId } = freshStore();

    const oldDeal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });
    expect(oldDeal.salesCutoffMinutes).toBe(0);

    const defaults = updateOperatorBookingDefaults(
      store,
      operatorId,
      { default_sales_cutoff_minutes: 120 },
      { now: NOW }
    );
    expect(defaults.defaultSalesCutoffMinutes).toBe(120);

    const response = bookingDefaultsResponse(defaults);
    expect(response.note).toBe(BOOKING_DEFAULTS_NOTE);
    expect(response.default_sales_cutoff_minutes).toBe(120);

    // Existing deal unchanged
    const stillOld = store.deals.get(oldDeal.id)!;
    expect(stillOld.salesCutoffMinutes).toBe(0);

    const newDeal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });
    expect(newDeal.salesCutoffMinutes).toBe(120);

    expect(getOperatorBookingDefaults(store, operatorId).defaultSalesCutoffMinutes).toBe(
      120
    );
  });

  it("rejects default_discount_pct below MIN_DISCOUNT_PCT and bad booking URL", () => {
    const { store, operatorId } = freshStore();
    expect(() =>
      updateOperatorBookingDefaults(store, operatorId, {
        default_discount_pct: 40,
      })
    ).toThrow(OperatorValidationError);

    expect(() =>
      updateOperatorBookingDefaults(store, operatorId, {
        default_booking_url: "http://not-https.example",
      })
    ).toThrow(OperatorValidationError);
  });
});

describe("Chunk 38 logo/cover upload", () => {
  it("uploads logo via media pipeline and sets https URL", async () => {
    const { store, operatorId } = freshStore();
    const storage = createMemoryMediaStorage("https://media.local/op");
    const png = buildSolidPng(256, 256);

    const updated = await uploadOperatorProfileImage(
      store,
      operatorId,
      "logo",
      { filename: "logo.png", bytes: png, contentType: "image/png" },
      { now: NOW, storage }
    );

    expect(updated.logo).toMatch(/^https:\/\//);
    expect(updated.logo).toContain("/profile/logo-");
  });

  it("rejects undersized cover", async () => {
    const { store, operatorId } = freshStore();
    const storage = createMemoryMediaStorage();
    const tiny = buildSolidPng(100, 100);

    await expect(
      uploadOperatorProfileImage(
        store,
        operatorId,
        "cover",
        { filename: "cover.png", bytes: tiny, contentType: "image/png" },
        { now: NOW, storage }
      )
    ).rejects.toThrow(OperatorValidationError);
  });
});
