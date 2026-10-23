/**
 * Pure helpers / labels for Compliance settings (Chunk 41).
 * Safe for client components — does not import operator-compliance.
 */

import type { ComplianceDocType, ReviewStatus, UserRole } from "./enums";
import {
  COMPLIANCE_DOC_TYPES,
  REVIEW_STATUSES,
} from "./enums";

import {
  COMPLIANCE_DOC_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
} from "./display-labels";

export { COMPLIANCE_DOC_TYPE_LABELS, REVIEW_STATUS_LABELS };

export const COMPLIANCE_FILE_LIMITS = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ] as const,
  acceptAttr: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
} as const;

export function canManageCompliance(
  role: UserRole | string | null | undefined
): boolean {
  return role === "owner" || role === "manager";
}

export function complianceDocTypeOptions(): Array<{
  value: ComplianceDocType;
  label: string;
}> {
  return COMPLIANCE_DOC_TYPES.map((value) => ({
    value,
    label: COMPLIANCE_DOC_TYPE_LABELS[value],
  }));
}

export function reviewStatusLabel(status: string): string {
  if ((REVIEW_STATUSES as readonly string[]).includes(status)) {
    return REVIEW_STATUS_LABELS[status as ReviewStatus];
  }
  return status;
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? []) {
    if (!out[e.field]) out[e.field] = e.message;
  }
  return out;
}

export function formatComplianceDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function reviewStatusTone(
  status: string
): "neutral" | "ok" | "warn" | "bad" {
  if (status === "approved") return "ok";
  if (status === "pending") return "warn";
  if (status === "rejected" || status === "expired") return "bad";
  return "neutral";
}
