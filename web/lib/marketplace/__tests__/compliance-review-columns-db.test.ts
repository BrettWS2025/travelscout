/**
 * Security S6: compliance review_status / reviewer_notes locked at the database.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import { createMemoryMediaStorage } from "@/lib/marketplace/media-storage";
import {
  approveComplianceDocument,
  complianceInputFromClient,
  createComplianceDocument,
  DB_LOCKED_COMPLIANCE_REVIEW_COLUMNS,
  rejectComplianceDocument,
  SYSTEM_OWNED_COMPLIANCE_REVIEW_FIELDS,
} from "@/lib/marketplace/operator-compliance";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261029000001_lock_compliance_review_status.sql"
);

const SETTINGS_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000005_create_settings_tables.sql"
);

describe("S6 migration — lock compliance review columns", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const createSql = readFileSync(SETTINGS_MIGRATION_PATH, "utf8");

  it("documents Security S6 and the service_role bypass pattern", () => {
    expect(sql).toContain(
      "Security S6: Lock compliance review_status (operators cannot self-approve)"
    );
    expect(sql).toContain(
      "current_user IN ('service_role', 'postgres', 'supabase_admin')"
    );
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it("adds BEFORE INSERT/UPDATE trigger on compliance_documents", () => {
    expect(sql).toContain("enforce_compliance_review_columns");
    expect(sql).toContain(
      "marketplace_compliance_documents_enforce_review_columns"
    );
    expect(sql).toMatch(
      /BEFORE INSERT OR UPDATE ON marketplace\.compliance_documents/
    );
    for (const col of DB_LOCKED_COMPLIANCE_REVIEW_COLUMNS) {
      expect(sql).toContain(col);
    }
  });

  it("on INSERT, clients may only create pending with null reviewer_notes", () => {
    expect(sql).toMatch(
      /TG_OP = 'INSERT'[\s\S]*NEW\.review_status IS DISTINCT FROM 'pending'[\s\S]*NEW\.reviewer_notes IS DISTINCT FROM NULL/
    );
  });

  it("on UPDATE, clients cannot change review_status or reviewer_notes", () => {
    expect(sql).toMatch(
      /NEW\.review_status IS DISTINCT FROM OLD\.review_status[\s\S]*NEW\.reviewer_notes IS DISTINCT FROM OLD\.reviewer_notes/
    );
  });

  it("keeps owner/manager content writes and documents service-role admin path", () => {
    expect(sql).toMatch(/Owners\/managers keep SELECT/);
    expect(sql).toMatch(/service-role client/i);
    expect(sql).toContain("approve/reject");
    expect(sql).toMatch(/no reviewed_at column/i);
  });

  it("create migration still has owner/manager UPDATE without column lock", () => {
    expect(createSql).toContain(
      'CREATE POLICY "Owners and managers can update compliance documents"'
    );
    expect(createSql).toContain("review_status");
    expect(createSql).toContain("reviewer_notes");
    expect(createSql).not.toContain("enforce_compliance_review_columns");
  });
});

describe("S6 app constants and client paths align with DB lock", () => {
  it("SYSTEM_OWNED_COMPLIANCE_REVIEW_FIELDS covers reviewStatus and reviewerNotes", () => {
    expect([...SYSTEM_OWNED_COMPLIANCE_REVIEW_FIELDS]).toEqual([
      "reviewStatus",
      "reviewerNotes",
    ]);
  });

  it("DB_LOCKED_COMPLIANCE_REVIEW_COLUMNS is the snake_case DB set", () => {
    expect([...DB_LOCKED_COMPLIANCE_REVIEW_COLUMNS]).toEqual([
      "review_status",
      "reviewer_notes",
    ]);
  });

  it("complianceInputFromClient strips review fields from client payloads", () => {
    const input = complianceInputFromClient({
      doc_type: "public_liability_insurance",
      issuer: "AMI",
      review_status: "approved",
      reviewStatus: "approved",
      reviewer_notes: "self-approve",
      reviewerNotes: "self-approve",
    });
    expect(input).not.toHaveProperty("reviewStatus");
    expect(input).not.toHaveProperty("reviewerNotes");
    expect(input).not.toHaveProperty("review_status");
    expect(input).not.toHaveProperty("reviewer_notes");
    expect(input.docType).toBe("public_liability_insurance");
    expect(input.issuer).toBe("AMI");
  });

  it("admin approve/reject API helpers still set review_status", async () => {
    const seeded = seedDevMarketplace({ now: "2026-10-22T08:00:00.000Z" });
    const store = createDealDraftStore(seeded.store);
    const operatorId = DEV_SEED_IDS.harbourKayaks.operatorId;
    const storage = createMemoryMediaStorage();
    const now = "2026-10-22T08:00:00.000Z";
    const pdfHeader = new TextEncoder().encode("%PDF-1.4\n");
    const bytes = new Uint8Array(64);
    bytes.set(pdfHeader);

    const doc = await createComplianceDocument(
      store,
      operatorId,
      {
        doc_type: "public_liability_insurance",
        expires_on: "2027-01-01",
      },
      {
        filename: "pli.pdf",
        bytes,
        contentType: "application/pdf",
      },
      { now, storage }
    );
    expect(doc.reviewStatus).toBe("pending");

    const approved = approveComplianceDocument(store, operatorId, doc.id, {
      now,
      reviewerNotes: "Verified",
    });
    expect(approved.reviewStatus).toBe("approved");
    expect(approved.reviewerNotes).toBe("Verified");

    const rejected = rejectComplianceDocument(store, operatorId, doc.id, {
      now,
      reviewerNotes: "Blurry scan",
    });
    expect(rejected.reviewStatus).toBe("rejected");
    expect(rejected.reviewerNotes).toBe("Blurry scan");
  });
});
