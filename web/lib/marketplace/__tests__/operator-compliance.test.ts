/**
 * Chunk 41 — Compliance documents: CRUD, expiry job, publish gate.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSolidPng } from "@/lib/marketplace/image-dimensions";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { createMemoryMediaStorage } from "@/lib/marketplace/media-storage";
import {
  approveComplianceDocument,
  createComplianceDocument,
  daysUntilExpiry,
  deleteComplianceDocument,
  getComplianceDocument,
  isComplianceDocValidForPublish,
  listOperatorComplianceDocuments,
  rejectComplianceDocument,
  runComplianceExpiryJob,
  serializeComplianceDocument,
  sniffComplianceMime,
  updateComplianceDocument,
  validateComplianceUploadBytes,
} from "@/lib/marketplace/operator-compliance";
import {
  REQUIRED_COMPLIANCE_DOC_TYPES,
  validateDealInStore,
} from "@/lib/marketplace/deal-publish-validation";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { seedNotificationPreferences } from "@/lib/marketplace/notifications";
import { can, permissionUserFromStore } from "@/lib/marketplace/permissions";

const NOW = "2026-10-21T12:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
};

function pdfBytes(size = 64): Uint8Array {
  const header = new TextEncoder().encode("%PDF-1.4\n");
  const out = new Uint8Array(Math.max(size, header.length));
  out.set(header);
  return out;
}

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

describe("Chunk 41 file sniff / limits", () => {
  it("accepts PDF / JPEG / PNG and rejects others / oversized", async () => {
    expect(sniffComplianceMime(pdfBytes())).toBe("application/pdf");
    const png = await buildSolidPng(8, 8);
    expect(sniffComplianceMime(png)).toBe("image/png");

    expect(() =>
      validateComplianceUploadBytes({
        filename: "x.bin",
        bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
      })
    ).toThrow(/PDF, JPG, or PNG/);

    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    huge.set(pdfBytes());
    expect(() =>
      validateComplianceUploadBytes({ filename: "big.pdf", bytes: huge })
    ).toThrow(/10 MB/);
  });
});

describe("Chunk 41 permissions", () => {
  it("owner and manager have settings.compliance; staff does not", () => {
    const { store, operatorId, ownerId, managerId, staffId } = freshStore();
    const members = [...store.operators.teamMembers.values()];
    expect(
      can(permissionUserFromStore(ownerId, members), operatorId, "settings.compliance")
    ).toBe(true);
    expect(
      can(
        permissionUserFromStore(managerId, members),
        operatorId,
        "settings.compliance"
      )
    ).toBe(true);
    expect(
      can(permissionUserFromStore(staffId, members), operatorId, "settings.compliance")
    ).toBe(false);
  });
});

describe("Chunk 41 CRUD", () => {
  const storage = createMemoryMediaStorage();

  beforeEach(() => {
    storage.files.clear();
  });

  it("creates pending doc, lists, updates reset to pending, deletes", async () => {
    const { store, operatorId } = freshStore();

    const created = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "public_liability_insurance",
        issuer: "AMI",
        reference_number: "PL-1",
        issued_on: "2026-01-01",
        expires_on: "2026-12-31",
      },
      { filename: "pli.pdf", bytes: pdfBytes(), contentType: "application/pdf" },
      { now: NOW, storage }
    );

    expect(created.reviewStatus).toBe("pending");
    expect(created.file).toMatch(/compliance/);
    expect(listOperatorComplianceDocuments(store, operatorId)).toHaveLength(1);

    const approved = approveComplianceDocument(store, operatorId, created.id, {
      now: NOW,
      reviewerNotes: "Looks good",
    });
    expect(approved.reviewStatus).toBe("approved");

    const updated = await updateComplianceDocument(
      store,
      operatorId,
      created.id,
      { issuer: "AMI Renewed" },
      { now: "2026-10-22T12:00:00.000Z", storage }
    );
    expect(updated.reviewStatus).toBe("pending");
    expect(updated.reviewerNotes).toBeNull();
    expect(updated.issuer).toBe("AMI Renewed");

    const serialized = serializeComplianceDocument(updated);
    expect(serialized.doc_type).toBe("public_liability_insurance");
    expect(serialized.review_status).toBe("pending");

    await deleteComplianceDocument(store, operatorId, created.id, { storage });
    expect(listOperatorComplianceDocuments(store, operatorId)).toHaveLength(0);
  });

  it("rejects invalid dates and missing doc_type", async () => {
    const { store, operatorId } = freshStore();
    await expect(
      createComplianceDocument(
        store,
        operatorId,
        { doc_type: "public_liability_insurance", expires_on: "31-12-2026" },
        { filename: "a.pdf", bytes: pdfBytes() },
        { storage }
      )
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createComplianceDocument(
        store,
        operatorId,
        { issuer: "X" },
        { filename: "a.pdf", bytes: pdfBytes() },
        { storage }
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it("admin reject requires notes; approve blocked when expired", async () => {
    const { store, operatorId } = freshStore();
    const doc = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "business_licence",
        expires_on: "2026-01-01",
      },
      { filename: "b.pdf", bytes: pdfBytes() },
      { now: NOW, storage }
    );

    expect(() =>
      rejectComplianceDocument(store, operatorId, doc.id, {
        now: NOW,
        reviewerNotes: "",
      })
    ).toThrow(/notes/i);

    const rejected = rejectComplianceDocument(store, operatorId, doc.id, {
      now: NOW,
      reviewerNotes: "Illegible scan",
    });
    expect(rejected.reviewStatus).toBe("rejected");

    const expiredDoc = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "food_licence",
        expires_on: "2026-10-01",
      },
      { filename: "c.pdf", bytes: pdfBytes() },
      { now: NOW, storage }
    );
    expect(() =>
      approveComplianceDocument(store, operatorId, expiredDoc.id, { now: NOW })
    ).toThrow(/expired/i);
  });
});

describe("Chunk 41 expiry job (fake clock)", () => {
  const storage = createMemoryMediaStorage();

  it("sends 30-day reminder once, then 7-day once, then marks expired", async () => {
    const { store, operatorId } = freshStore();
    // expires 2026-11-20 → from 2026-10-21 is 30 days (end of day math)
    const expiresOn = "2026-11-20";
    const doc = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "public_liability_insurance",
        expires_on: expiresOn,
      },
      { filename: "pli.pdf", bytes: pdfBytes() },
      { now: NOW, storage }
    );

    const at30 = "2026-10-21T12:00:00.000Z";
    expect(daysUntilExpiry(expiresOn, Date.parse(at30))).toBe(30);

    const first = await runComplianceExpiryJob(store, { now: at30 });
    expect(first.remindersSent).toEqual([
      expect.objectContaining({
        documentId: doc.id,
        daysBefore: 30,
      }),
    ]);
    expect(first.markedExpired).toEqual([]);

    const again30 = await runComplianceExpiryJob(store, { now: at30 });
    expect(again30.remindersSent).toEqual([]);

    const at7 = "2026-11-13T12:00:00.000Z";
    expect(daysUntilExpiry(expiresOn, Date.parse(at7))).toBe(7);
    const second = await runComplianceExpiryJob(store, { now: at7 });
    expect(second.remindersSent).toEqual([
      expect.objectContaining({
        documentId: doc.id,
        daysBefore: 7,
      }),
    ]);

    const again7 = await runComplianceExpiryJob(store, { now: at7 });
    expect(again7.remindersSent).toEqual([]);

    const past = "2026-11-21T00:00:00.000Z";
    const expired = await runComplianceExpiryJob(store, { now: past });
    expect(expired.markedExpired).toContain(doc.id);
    expect(getComplianceDocument(store, operatorId, doc.id).reviewStatus).toBe(
      "expired"
    );

    // Deliveries recorded for compliance_expiring
    const deliveries = [...(store.notificationDeliveries?.values() ?? [])].filter(
      (d) => d.eventType === "compliance_expiring"
    );
    expect(deliveries.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Chunk 41 ENFORCE_COMPLIANCE_ON_PUBLISH", () => {
  const storage = createMemoryMediaStorage();
  const originalEnv = process.env.ENFORCE_COMPLIANCE_ON_PUBLISH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENFORCE_COMPLIANCE_ON_PUBLISH;
    } else {
      process.env.ENFORCE_COMPLIANCE_ON_PUBLISH = originalEnv;
    }
  });

  it("fails publish validation when required doc missing/expired; passes when on file", async () => {
    process.env.ENFORCE_COMPLIANCE_ON_PUBLISH = "true";
    const { store, operatorId } = freshStore();

    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });

    const missing = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    const complianceCheck = missing.checks.find((c) => c.key === "compliance");
    expect(complianceCheck?.passed).toBe(false);
    expect(REQUIRED_COMPLIANCE_DOC_TYPES).toContain(
      "public_liability_insurance"
    );

    await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "public_liability_insurance",
        expires_on: "2027-01-01",
      },
      { filename: "pli.pdf", bytes: pdfBytes() },
      { now: NOW, storage }
    );

    const ok = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(ok.checks.find((c) => c.key === "compliance")?.passed).toBe(true);

    // Expired doc fails
    store.complianceDocuments!.clear();
    const expiredDoc = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "public_liability_insurance",
        expires_on: "2026-01-01",
      },
      { filename: "old.pdf", bytes: pdfBytes() },
      { now: NOW, storage }
    );
    expect(
      isComplianceDocValidForPublish(expiredDoc, Date.parse(NOW))
    ).toBe(false);

    const failExpired = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(failExpired.checks.find((c) => c.key === "compliance")?.passed).toBe(
      false
    );
  });
});
