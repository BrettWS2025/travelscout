/**
 * Compliance documents (deals platform Chunk 41).
 *
 * - CRUD under /operators/:id/compliance with file upload (pdf/jpg/png ≤10 MB)
 * - New/changed docs → review_status pending
 * - Admin approve/reject with reviewer_notes
 * - Daily job: compliance_expiring at 30 and 7 days (once each); mark expired
 * - Publish validation uses ENFORCE_COMPLIANCE_ON_PUBLISH + REQUIRED_COMPLIANCE_DOC_TYPES
 *
 * Keep free of server-only imports (auth, permissions, next/headers) so
 * compliance-ui / client components can import serializers and labels safely.
 */

import { sniffImageMime } from "./image-dimensions";
import {
  getMediaStorage,
  type MediaStorage,
} from "./media-storage";
import { notify } from "./notifications";
import type { ComplianceDocType, ReviewStatus } from "./enums";
import { isComplianceDocType } from "./enums";
import {
  validateComplianceDocumentFields,
  type ComplianceDocument,
  type SettingsFieldError,
} from "./settings";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMPLIANCE_FILE_LIMITS = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ] as const,
} as const;

export type AllowedComplianceMimeType =
  (typeof COMPLIANCE_FILE_LIMITS.allowedMimeTypes)[number];

/** Reminder thresholds (days before expires_on). */
export const COMPLIANCE_REMINDER_DAYS = [30, 7] as const;
export type ComplianceReminderDay = (typeof COMPLIANCE_REMINDER_DAYS)[number];

/**
 * Default required docs when ENFORCE_COMPLIANCE_ON_PUBLISH (Chunk 16/41).
 * Kept here and mirrored in deal-publish-validation REQUIRED_COMPLIANCE_DOC_TYPES.
 */
export const DEFAULT_REQUIRED_COMPLIANCE_DOC_TYPES = [
  "public_liability_insurance",
] as const satisfies readonly ComplianceDocType[];

export const COMPLIANCE_DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  public_liability_insurance: "Public liability insurance",
  adventure_activities_certificate: "Adventure activities certificate",
  maritime_licence: "Maritime licence",
  business_licence: "Business licence",
  food_licence: "Food licence",
  other: "Other",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ComplianceError extends Error {
  readonly status: number;
  readonly errors?: SettingsFieldError[];
  readonly code?: string;

  constructor(
    message: string,
    status = 400,
    extras?: { errors?: SettingsFieldError[]; code?: string }
  ) {
    super(message);
    this.name = "ComplianceError";
    this.status = status;
    this.errors = extras?.errors;
    this.code = extras?.code;
  }
}

// ---------------------------------------------------------------------------
// Store shape (compatible with DealDraftStore without importing it)
// ---------------------------------------------------------------------------

export type ComplianceReminderRecord = {
  id: string;
  documentId: string;
  operatorId: string;
  /** 30 or 7 */
  daysBefore: ComplianceReminderDay;
  sentAt: string;
};

export type ComplianceDealStore = {
  operators: {
    operators: Map<string, { id: string }>;
  };
  complianceDocuments?: Map<string, ComplianceDocument>;
  complianceReminders?: Map<string, ComplianceReminderRecord>;
  notificationPreferences?: Map<string, unknown>;
  inAppNotifications?: Map<string, unknown>;
  notificationIncidents?: Map<string, unknown>;
  notificationDeliveries?: Map<string, unknown>;
  dailySummarySent?: Map<string, unknown>;
  deals: Map<string, { operatorId: string }>;
};

function ensureDocMap(
  store: ComplianceDealStore
): Map<string, ComplianceDocument> {
  if (!store.complianceDocuments) {
    store.complianceDocuments = new Map();
  }
  return store.complianceDocuments;
}

function ensureReminderMap(
  store: ComplianceDealStore
): Map<string, ComplianceReminderRecord> {
  if (!store.complianceReminders) {
    store.complianceReminders = new Map();
  }
  return store.complianceReminders;
}

function requireOperator(store: ComplianceDealStore, operatorId: string): void {
  if (!store.operators.operators.has(operatorId)) {
    throw new ComplianceError("Operator not found", 404);
  }
}

function getDocOrThrow(
  store: ComplianceDealStore,
  docId: string
): ComplianceDocument {
  const doc = ensureDocMap(store).get(docId);
  if (!doc) {
    throw new ComplianceError("Compliance document not found", 404);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return false;
  // Reject overflow like 2026-13-40 that Date.parse may coerce
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === value;
}

/** End of UTC calendar day for an ISO date (inclusive validity). */
export function expiresOnEndMs(expiresOn: string): number {
  return Date.parse(`${expiresOn}T00:00:00.000Z`) + 24 * 60 * 60 * 1000 - 1;
}

export function isComplianceDocExpired(
  doc: Pick<ComplianceDocument, "expiresOn" | "reviewStatus">,
  nowMs: number
): boolean {
  if (doc.reviewStatus === "expired") return true;
  if (!doc.expiresOn) return false;
  if (!isIsoDateString(doc.expiresOn)) return true;
  return expiresOnEndMs(doc.expiresOn) < nowMs;
}

/**
 * Document counts for ENFORCE_COMPLIANCE_ON_PUBLISH: on file, not rejected,
 * and not past expiry.
 */
export function isComplianceDocValidForPublish(
  doc: ComplianceDocument,
  nowMs: number
): boolean {
  if (doc.reviewStatus === "rejected" || doc.reviewStatus === "expired") {
    return false;
  }
  return !isComplianceDocExpired(doc, nowMs);
}

export function daysUntilExpiry(
  expiresOn: string,
  nowMs: number
): number {
  const end = expiresOnEndMs(expiresOn);
  return Math.floor((end - nowMs) / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// File sniff / upload
// ---------------------------------------------------------------------------

export function sniffComplianceMime(
  bytes: Uint8Array
): AllowedComplianceMimeType | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  // Some PDFs start with %PDF without version hyphen immediately; accept %PDF
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  const image = sniffImageMime(bytes);
  if (image === "image/jpeg" || image === "image/png") return image;
  return null;
}

function ascii(buf: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...buf.subarray(offset, offset + len));
}

export function extensionForComplianceMime(
  mime: AllowedComplianceMimeType
): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

export function buildComplianceStorageKey(
  operatorId: string,
  docId: string,
  ext: string
): string {
  return `operators/${operatorId}/compliance/${docId}.${ext}`;
}

export type ComplianceUploadFile = {
  filename: string;
  bytes: Uint8Array;
  contentType?: string | null;
};

export function validateComplianceUploadBytes(
  file: ComplianceUploadFile
): { mime: AllowedComplianceMimeType; sizeBytes: number } {
  if (file.bytes.byteLength < 1) {
    throw new ComplianceError("File is empty", 400, {
      errors: [{ field: "file", message: "file is empty" }],
      code: "empty_file",
    });
  }
  if (file.bytes.byteLength > COMPLIANCE_FILE_LIMITS.maxFileSizeBytes) {
    throw new ComplianceError("File exceeds 10 MB limit", 400, {
      errors: [
        {
          field: "file",
          message: `max ${COMPLIANCE_FILE_LIMITS.maxFileSizeBytes} bytes`,
        },
      ],
      code: "file_too_large",
    });
  }
  const mime = sniffComplianceMime(file.bytes);
  if (!mime) {
    throw new ComplianceError("File must be PDF, JPG, or PNG", 400, {
      errors: [
        {
          field: "file",
          message: "must be application/pdf, image/jpeg, or image/png",
        },
      ],
      code: "invalid_mime",
    });
  }
  if (file.contentType) {
    const declared = file.contentType.toLowerCase().split(";")[0]!.trim();
    const aliases: Record<string, string> = {
      "image/jpg": "image/jpeg",
      "application/x-pdf": "application/pdf",
    };
    const normalised = aliases[declared] ?? declared;
    if (normalised !== mime) {
      throw new ComplianceError("Declared Content-Type does not match file", 400, {
        errors: [
          {
            field: "file",
            message: `content-type ${declared} does not match sniffed ${mime}`,
          },
        ],
        code: "mime_mismatch",
      });
    }
  }
  return { mime, sizeBytes: file.bytes.byteLength };
}

async function storeComplianceFile(
  storage: MediaStorage,
  operatorId: string,
  docId: string,
  file: ComplianceUploadFile
): Promise<{ key: string; url: string; mime: AllowedComplianceMimeType }> {
  const { mime } = validateComplianceUploadBytes(file);
  const key = buildComplianceStorageKey(
    operatorId,
    docId,
    extensionForComplianceMime(mime)
  );
  const stored = await storage.put(key, file.bytes, mime);
  return { key: stored.key, url: stored.url, mime };
}

// ---------------------------------------------------------------------------
// Field parsing / validation
// ---------------------------------------------------------------------------

export type ComplianceDocInput = {
  docType?: unknown;
  issuer?: unknown;
  referenceNumber?: unknown;
  issuedOn?: unknown;
  expiresOn?: unknown;
};

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length ? t : null;
}

function parseComplianceInput(raw: ComplianceDocInput): {
  docType?: ComplianceDocType;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  errors: SettingsFieldError[];
} {
  const errors: SettingsFieldError[] = [];

  let docType: ComplianceDocType | undefined;
  if (raw.docType !== undefined) {
    if (!isComplianceDocType(raw.docType)) {
      errors.push({ field: "doc_type", message: "invalid compliance_doc_type" });
    } else {
      docType = raw.docType;
    }
  }

  const issuer = optionalString(raw.issuer);
  if (raw.issuer !== undefined && typeof raw.issuer !== "string" && raw.issuer !== null) {
    errors.push({ field: "issuer", message: "must be a string" });
  }

  const referenceNumber = optionalString(raw.referenceNumber);
  if (
    raw.referenceNumber !== undefined &&
    typeof raw.referenceNumber !== "string" &&
    raw.referenceNumber !== null
  ) {
    errors.push({ field: "reference_number", message: "must be a string" });
  }

  let issuedOn: string | null | undefined;
  if (raw.issuedOn !== undefined) {
    if (raw.issuedOn === null || raw.issuedOn === "") {
      issuedOn = null;
    } else if (!isIsoDateString(raw.issuedOn)) {
      errors.push({
        field: "issued_on",
        message: "must be YYYY-MM-DD",
      });
    } else {
      issuedOn = raw.issuedOn;
    }
  }

  let expiresOn: string | null | undefined;
  if (raw.expiresOn !== undefined) {
    if (raw.expiresOn === null || raw.expiresOn === "") {
      expiresOn = null;
    } else if (!isIsoDateString(raw.expiresOn)) {
      errors.push({
        field: "expires_on",
        message: "must be YYYY-MM-DD",
      });
    } else {
      expiresOn = raw.expiresOn;
    }
  }

  // Shared validator for doc_type / review_status / lengths; dates handled above.
  const fieldErrors = validateComplianceDocumentFields({
    docType,
    issuer: issuer === undefined ? undefined : issuer ?? "",
    referenceNumber:
      referenceNumber === undefined ? undefined : referenceNumber ?? "",
  });
  for (const e of fieldErrors) {
    if (!errors.some((x) => x.field === e.field && x.message === e.message)) {
      errors.push(e);
    }
  }

  return { docType, issuer, referenceNumber, issuedOn, expiresOn, errors };
}

export function complianceInputFromClient(
  body: Record<string, unknown>
): ComplianceDocInput {
  return {
    docType: body.doc_type ?? body.docType,
    issuer: body.issuer,
    referenceNumber: body.reference_number ?? body.referenceNumber,
    issuedOn: body.issued_on ?? body.issuedOn,
    expiresOn: body.expires_on ?? body.expiresOn,
  };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeComplianceDocument(
  doc: ComplianceDocument,
  options?: { fileUrl?: string | null }
): Record<string, unknown> {
  return {
    id: doc.id,
    operator_id: doc.operatorId,
    doc_type: doc.docType,
    doc_type_label: COMPLIANCE_DOC_TYPE_LABELS[doc.docType],
    file: doc.file,
    file_url: options?.fileUrl ?? null,
    issuer: doc.issuer,
    reference_number: doc.referenceNumber,
    issued_on: doc.issuedOn,
    expires_on: doc.expiresOn,
    review_status: doc.reviewStatus,
    review_status_label: REVIEW_STATUS_LABELS[doc.reviewStatus],
    reviewer_notes: doc.reviewerNotes,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

export function fileUrlForComplianceDoc(
  doc: ComplianceDocument,
  storage?: MediaStorage
): string | null {
  if (!doc.file) return null;
  try {
    return (storage ?? getMediaStorage()).getPublicUrl(doc.file);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listOperatorComplianceDocuments(
  store: ComplianceDealStore,
  operatorId: string
): ComplianceDocument[] {
  requireOperator(store, operatorId);
  return [...ensureDocMap(store).values()]
    .filter((d) => d.operatorId === operatorId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  docId: string
): ComplianceDocument {
  requireOperator(store, operatorId);
  const doc = getDocOrThrow(store, docId);
  if (doc.operatorId !== operatorId) {
    throw new ComplianceError("Compliance document not found", 404);
  }
  return doc;
}

export async function createComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  raw: Record<string, unknown>,
  file: ComplianceUploadFile,
  options?: { now?: string; id?: string; storage?: MediaStorage }
): Promise<ComplianceDocument> {
  requireOperator(store, operatorId);
  const parsed = parseComplianceInput(complianceInputFromClient(raw));
  if (!parsed.docType) {
    parsed.errors.push({ field: "doc_type", message: "required" });
  }
  if (parsed.errors.length) {
    throw new ComplianceError("Invalid compliance document", 400, {
      errors: parsed.errors,
    });
  }

  const now = options?.now ?? new Date().toISOString();
  const id = options?.id ?? crypto.randomUUID();
  const storage = options?.storage ?? getMediaStorage();
  const stored = await storeComplianceFile(storage, operatorId, id, file);

  const doc: ComplianceDocument = {
    id,
    operatorId,
    docType: parsed.docType!,
    file: stored.key,
    issuer: parsed.issuer ?? null,
    referenceNumber: parsed.referenceNumber ?? null,
    issuedOn: parsed.issuedOn ?? null,
    expiresOn: parsed.expiresOn ?? null,
    reviewStatus: "pending",
    reviewerNotes: null,
    createdAt: now,
    updatedAt: now,
  };
  ensureDocMap(store).set(doc.id, doc);
  return doc;
}

export async function updateComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  docId: string,
  raw: Record<string, unknown>,
  options?: {
    now?: string;
    file?: ComplianceUploadFile | null;
    storage?: MediaStorage;
  }
): Promise<ComplianceDocument> {
  const existing = getComplianceDocument(store, operatorId, docId);
  const parsed = parseComplianceInput(complianceInputFromClient(raw));
  if (parsed.errors.length) {
    throw new ComplianceError("Invalid compliance document", 400, {
      errors: parsed.errors,
    });
  }

  const now = options?.now ?? new Date().toISOString();
  const storage = options?.storage ?? getMediaStorage();
  let nextFile = existing.file;

  if (options?.file) {
    const stored = await storeComplianceFile(
      storage,
      operatorId,
      docId,
      options.file
    );
    if (existing.file && existing.file !== stored.key) {
      try {
        await storage.delete(existing.file);
      } catch {
        // best-effort cleanup
      }
    }
    nextFile = stored.key;
  }

  const changedMeta =
    (parsed.docType !== undefined && parsed.docType !== existing.docType) ||
    (parsed.issuer !== undefined && parsed.issuer !== existing.issuer) ||
    (parsed.referenceNumber !== undefined &&
      parsed.referenceNumber !== existing.referenceNumber) ||
    (parsed.issuedOn !== undefined && parsed.issuedOn !== existing.issuedOn) ||
    (parsed.expiresOn !== undefined &&
      parsed.expiresOn !== existing.expiresOn) ||
    Boolean(options?.file);

  const updated: ComplianceDocument = {
    ...existing,
    docType: parsed.docType ?? existing.docType,
    file: nextFile,
    issuer:
      parsed.issuer !== undefined ? parsed.issuer : existing.issuer,
    referenceNumber:
      parsed.referenceNumber !== undefined
        ? parsed.referenceNumber
        : existing.referenceNumber,
    issuedOn:
      parsed.issuedOn !== undefined ? parsed.issuedOn : existing.issuedOn,
    expiresOn:
      parsed.expiresOn !== undefined ? parsed.expiresOn : existing.expiresOn,
    // New/changed docs reset to pending; clear prior reviewer notes
    reviewStatus: changedMeta ? "pending" : existing.reviewStatus,
    reviewerNotes: changedMeta ? null : existing.reviewerNotes,
    updatedAt: now,
  };

  // Changing expires_on clears prior reminder markers so new window can notify
  if (
    parsed.expiresOn !== undefined &&
    parsed.expiresOn !== existing.expiresOn
  ) {
    const reminders = ensureReminderMap(store);
    for (const [id, row] of [...reminders.entries()]) {
      if (row.documentId === docId) reminders.delete(id);
    }
  }

  ensureDocMap(store).set(updated.id, updated);
  return updated;
}

export async function deleteComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  docId: string,
  options?: { storage?: MediaStorage }
): Promise<void> {
  const existing = getComplianceDocument(store, operatorId, docId);
  const storage = options?.storage ?? getMediaStorage();
  if (existing.file) {
    try {
      await storage.delete(existing.file);
    } catch {
      // best-effort
    }
  }
  ensureDocMap(store).delete(docId);
  const reminders = ensureReminderMap(store);
  for (const [id, row] of [...reminders.entries()]) {
    if (row.documentId === docId) reminders.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

export function approveComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  docId: string,
  options?: { now?: string; reviewerNotes?: string | null }
): ComplianceDocument {
  const existing = getComplianceDocument(store, operatorId, docId);
  const now = options?.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  if (isComplianceDocExpired(existing, nowMs)) {
    throw new ComplianceError(
      "Cannot approve an expired compliance document",
      409,
      { code: "expired" }
    );
  }
  const notes =
    options?.reviewerNotes === undefined
      ? existing.reviewerNotes
      : options.reviewerNotes?.trim() || null;
  const updated: ComplianceDocument = {
    ...existing,
    reviewStatus: "approved",
    reviewerNotes: notes,
    updatedAt: now,
  };
  ensureDocMap(store).set(updated.id, updated);
  return updated;
}

export function rejectComplianceDocument(
  store: ComplianceDealStore,
  operatorId: string,
  docId: string,
  options?: { now?: string; reviewerNotes?: string | null }
): ComplianceDocument {
  const existing = getComplianceDocument(store, operatorId, docId);
  const now = options?.now ?? new Date().toISOString();
  const notesRaw = options?.reviewerNotes;
  const notes =
    typeof notesRaw === "string" ? notesRaw.trim() : notesRaw === null ? null : "";
  if (!notes) {
    throw new ComplianceError("Reviewer notes are required to reject", 400, {
      errors: [{ field: "reviewer_notes", message: "required" }],
    });
  }
  const updated: ComplianceDocument = {
    ...existing,
    reviewStatus: "rejected",
    reviewerNotes: notes,
    updatedAt: now,
  };
  ensureDocMap(store).set(updated.id, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Daily job
// ---------------------------------------------------------------------------

export type ComplianceJobReminderSent = {
  documentId: string;
  operatorId: string;
  daysBefore: ComplianceReminderDay;
  expiresOn: string;
};

export type ComplianceJobResult = {
  markedExpired: string[];
  remindersSent: ComplianceJobReminderSent[];
};

function reminderAlreadySent(
  store: ComplianceDealStore,
  documentId: string,
  daysBefore: ComplianceReminderDay
): boolean {
  for (const row of ensureReminderMap(store).values()) {
    if (row.documentId === documentId && row.daysBefore === daysBefore) {
      return true;
    }
  }
  return false;
}

function recordReminder(
  store: ComplianceDealStore,
  doc: ComplianceDocument,
  daysBefore: ComplianceReminderDay,
  at: string
): void {
  const row: ComplianceReminderRecord = {
    id: crypto.randomUUID(),
    documentId: doc.id,
    operatorId: doc.operatorId,
    daysBefore,
    sentAt: at,
  };
  ensureReminderMap(store).set(row.id, row);
}

/**
 * Daily compliance job: mark expired docs; send compliance_expiring at 30 and
 * 7 days before expires_on (once each). Idempotent.
 */
export async function runComplianceExpiryJob(
  store: ComplianceDealStore,
  options?: { now?: string }
): Promise<ComplianceJobResult> {
  const now = options?.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const markedExpired: string[] = [];
  const remindersSent: ComplianceJobReminderSent[] = [];
  const docs = ensureDocMap(store);

  for (const doc of [...docs.values()]) {
    if (!doc.expiresOn || !isIsoDateString(doc.expiresOn)) continue;

    const daysLeft = daysUntilExpiry(doc.expiresOn, nowMs);

    if (daysLeft < 0) {
      if (doc.reviewStatus !== "expired") {
        const updated: ComplianceDocument = {
          ...doc,
          reviewStatus: "expired",
          updatedAt: now,
        };
        docs.set(updated.id, updated);
        markedExpired.push(updated.id);
      }
      continue;
    }

    // Skip rejected docs for reminders (operator already knows)
    if (doc.reviewStatus === "rejected") continue;

    for (const threshold of COMPLIANCE_REMINDER_DAYS) {
      if (daysLeft > threshold) continue;
      if (reminderAlreadySent(store, doc.id, threshold)) continue;

      const label = COMPLIANCE_DOC_TYPE_LABELS[doc.docType];
      const title =
        threshold === 7
          ? `${label} expires in 7 days`
          : `${label} expires in 30 days`;
      const body = `${label} expires on ${doc.expiresOn}. Upload a renewed document in Settings → Compliance.`;

      await notify(
        store as Parameters<typeof notify>[0],
        doc.operatorId,
        "compliance_expiring",
        {
          document_id: doc.id,
          doc_type: doc.docType,
          expires_on: doc.expiresOn,
          days_before: threshold,
          body,
        },
        {
          now,
          incidentKey: `compliance_expiring:${doc.id}:${threshold}:${doc.expiresOn}`,
          title,
          body,
        }
      );

      recordReminder(store, doc, threshold, now);
      remindersSent.push({
        documentId: doc.id,
        operatorId: doc.operatorId,
        daysBefore: threshold,
        expiresOn: doc.expiresOn,
      });
    }
  }

  return { markedExpired, remindersSent };
}

// ---------------------------------------------------------------------------
// Publish helper
// ---------------------------------------------------------------------------

export function complianceDocumentsForOperator(
  store: ComplianceDealStore,
  operatorId: string
): ComplianceDocument[] {
  if (!store.complianceDocuments) return [];
  return [...store.complianceDocuments.values()].filter(
    (d) => d.operatorId === operatorId
  );
}
