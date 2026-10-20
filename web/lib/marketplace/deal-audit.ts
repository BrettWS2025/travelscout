/**
 * DealEvent, DealAttestation, ClickEvent, DealMetricDaily, DealTemplate
 * (deals platform Chunk 6).
 *
 * Tables: marketplace.deal_events, deal_attestations, click_events,
 * deal_metric_daily, deal_templates.
 * Parent deals: marketplace.operator_deals (not legacy marketplace.deals).
 *
 * DealEvent is append-only: inserts only — update/delete throw in the service
 * and are blocked by DB triggers.
 */

import type {
  ActorType,
  AttestationMethod,
  RecheckResult,
} from "./enums";
import {
  isActorType,
  isAttestationMethod,
  isRecheckResult,
} from "./enums";

// ---------------------------------------------------------------------------
// DealEvent event types (not a platform enum — audit vocabulary)
// ---------------------------------------------------------------------------

export const DEAL_EVENT_TYPES = [
  "created",
  "updated",
  "published",
  "scheduled",
  "submitted_for_review",
  "approved",
  "rejected",
  "paused",
  "auto_paused",
  "resumed",
  "auto_resumed",
  "sold_out",
  "expired",
  "ended",
  "archived",
  "price_changed",
  "seats_changed",
  "session_added",
  "session_removed",
  "attested",
  "link_broken",
  "link_ok",
] as const;
export type DealEventType = (typeof DEAL_EVENT_TYPES)[number];

export function isDealEventType(value: unknown): value is DealEventType {
  return (
    typeof value === "string" &&
    (DEAL_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Optional structured detail written with status / pause transitions. */
export type DealEventDetail = {
  from_status?: string;
  to_status?: string;
  reason?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type DealEvent = {
  id: string;
  dealId: string;
  eventType: DealEventType;
  actorType: ActorType;
  actorId: string | null;
  detail: DealEventDetail;
  createdAt: string;
};

export type DealAttestation = {
  id: string;
  dealId: string;
  attestedBy: string | null;
  attestedAt: string;
  method: AttestationMethod;
  /** Map of session_id → seats confirmed */
  seatsBySession: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type ClickEvent = {
  id: string;
  dealId: string;
  dealSessionId: string | null;
  clickId: string;
  visitorId: string | null;
  recheckResult: RecheckResult | null;
  redirectUrl: string | null;
  createdAt: string;
};

export type DealMetricDaily = {
  id: string;
  dealId: string;
  /** Local calendar date YYYY-MM-DD */
  date: string;
  impressions: number;
  detailViews: number;
  bookingClicks: number;
  soldOutOnClick: number;
  attributedBookings: number;
  attributedRevenueMinor: number;
  createdAt: string;
  updatedAt: string;
};

export type DealTemplate = {
  id: string;
  operatorId: string;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type AppendDealEventInput = {
  dealId: string;
  eventType: DealEventType;
  actorType: ActorType;
  actorId?: string | null;
  detail?: DealEventDetail;
};

export type CreateDealAttestationInput = {
  dealId: string;
  method: AttestationMethod;
  seatsBySession: Record<string, number>;
  attestedBy?: string | null;
  attestedAt?: string;
};

export type CreateClickEventInput = {
  dealId: string;
  clickId: string;
  dealSessionId?: string | null;
  visitorId?: string | null;
  recheckResult?: RecheckResult | null;
  redirectUrl?: string | null;
};

export type UpsertDealMetricDailyInput = {
  dealId: string;
  date: string;
  impressions?: number;
  detailViews?: number;
  bookingClicks?: number;
  soldOutOnClick?: number;
  attributedBookings?: number;
  attributedRevenueMinor?: number;
};

export type CreateDealTemplateInput = {
  operatorId: string;
  name: string;
  payload?: Record<string, unknown>;
};

export type FieldError = { field: string; message: string };

export class DealAuditValidationError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "DealAuditValidationError";
    this.errors = errors;
  }
}

export class DealEventAppendOnlyError extends Error {
  constructor(operation: "update" | "delete") {
    super(`DealEvent is append-only: ${operation} is not allowed`);
    this.name = "DealEventAppendOnlyError";
  }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE_NAME_MAX = 120;

function nonNegInt(
  value: number | undefined,
  field: string,
  errors: FieldError[]
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    errors.push({ field, message: `${field} must be an integer ≥ 0` });
  }
}

export function validateAppendDealEventInput(
  input: AppendDealEventInput
): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.dealId) {
    errors.push({ field: "deal_id", message: "deal_id is required" });
  }
  if (!isDealEventType(input.eventType)) {
    errors.push({ field: "event_type", message: "invalid event_type" });
  }
  if (!isActorType(input.actorType)) {
    errors.push({ field: "actor_type", message: "invalid actor_type" });
  }
  if (
    input.detail != null &&
    (typeof input.detail !== "object" || Array.isArray(input.detail))
  ) {
    errors.push({ field: "detail", message: "detail must be an object" });
  }

  return errors;
}

export function validateDealAttestationInput(
  input: CreateDealAttestationInput
): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.dealId) {
    errors.push({ field: "deal_id", message: "deal_id is required" });
  }
  if (!isAttestationMethod(input.method)) {
    errors.push({ field: "method", message: "invalid attestation method" });
  }
  if (
    input.seatsBySession == null ||
    typeof input.seatsBySession !== "object" ||
    Array.isArray(input.seatsBySession)
  ) {
    errors.push({
      field: "seats_by_session",
      message: "seats_by_session must be an object map",
    });
  } else {
    for (const [sessionId, seats] of Object.entries(input.seatsBySession)) {
      if (!sessionId) {
        errors.push({
          field: "seats_by_session",
          message: "session ids must be non-empty",
        });
        break;
      }
      if (!Number.isInteger(seats) || seats < 0 || seats > 999) {
        errors.push({
          field: `seats_by_session.${sessionId}`,
          message: "seats must be an integer 0–999",
        });
      }
    }
  }

  return errors;
}

export function validateClickEventInput(
  input: CreateClickEventInput
): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.dealId) {
    errors.push({ field: "deal_id", message: "deal_id is required" });
  }
  if (!input.clickId || typeof input.clickId !== "string") {
    errors.push({ field: "click_id", message: "click_id is required" });
  }
  if (
    input.recheckResult != null &&
    !isRecheckResult(input.recheckResult)
  ) {
    errors.push({
      field: "recheck_result",
      message: "invalid recheck_result",
    });
  }

  return errors;
}

export function validateDealMetricDailyInput(
  input: UpsertDealMetricDailyInput
): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.dealId) {
    errors.push({ field: "deal_id", message: "deal_id is required" });
  }
  if (!input.date || !DATE_RE.test(input.date)) {
    errors.push({
      field: "date",
      message: "date must be YYYY-MM-DD",
    });
  }
  nonNegInt(input.impressions, "impressions", errors);
  nonNegInt(input.detailViews, "detail_views", errors);
  nonNegInt(input.bookingClicks, "booking_clicks", errors);
  nonNegInt(input.soldOutOnClick, "sold_out_on_click", errors);
  nonNegInt(input.attributedBookings, "attributed_bookings", errors);
  nonNegInt(input.attributedRevenueMinor, "attributed_revenue_minor", errors);

  return errors;
}

export function validateDealTemplateInput(
  input: CreateDealTemplateInput
): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.operatorId) {
    errors.push({ field: "operator_id", message: "operator_id is required" });
  }
  const name = input.name?.trim() ?? "";
  if (!name) {
    errors.push({ field: "name", message: "name is required" });
  } else if (name.length > TEMPLATE_NAME_MAX) {
    errors.push({
      field: "name",
      message: `name must be ≤ ${TEMPLATE_NAME_MAX} characters`,
    });
  }
  if (
    input.payload != null &&
    (typeof input.payload !== "object" || Array.isArray(input.payload))
  ) {
    errors.push({ field: "payload", message: "payload must be an object" });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// In-memory store (unit tests; DB path used by later API chunks)
// ---------------------------------------------------------------------------

export type DealAuditStore = {
  events: Map<string, DealEvent>;
  attestations: Map<string, DealAttestation>;
  clicks: Map<string, ClickEvent>;
  metrics: Map<string, DealMetricDaily>;
  templates: Map<string, DealTemplate>;
};

export function createDealAuditStore(): DealAuditStore {
  return {
    events: new Map(),
    attestations: new Map(),
    clicks: new Map(),
    metrics: new Map(),
    templates: new Map(),
  };
}

function metricKey(dealId: string, date: string): string {
  return `${dealId}:${date}`;
}

/**
 * Append a DealEvent. The only write path for deal_events.
 */
export function appendDealEvent(
  store: DealAuditStore,
  input: AppendDealEventInput,
  options?: { id?: string; now?: string }
): DealEvent {
  const errors = validateAppendDealEventInput(input);
  if (errors.length) throw new DealAuditValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const row: DealEvent = {
    id: options?.id ?? crypto.randomUUID(),
    dealId: input.dealId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    detail: input.detail ?? {},
    createdAt: now,
  };
  store.events.set(row.id, row);
  return row;
}

/**
 * Explicitly rejected — DealEvent rows cannot be updated through the model.
 */
export function updateDealEvent(
  _store: DealAuditStore,
  _eventId: string,
  _patch: Partial<DealEvent>
): never {
  throw new DealEventAppendOnlyError("update");
}

/**
 * Explicitly rejected — DealEvent rows cannot be deleted through the model.
 */
export function deleteDealEvent(
  _store: DealAuditStore,
  _eventId: string
): never {
  throw new DealEventAppendOnlyError("delete");
}

export function listDealEvents(
  store: DealAuditStore,
  dealId: string
): DealEvent[] {
  return [...store.events.values()]
    .filter((e) => e.dealId === dealId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createDealAttestation(
  store: DealAuditStore,
  input: CreateDealAttestationInput,
  options?: { id?: string; now?: string }
): DealAttestation {
  const errors = validateDealAttestationInput(input);
  if (errors.length) throw new DealAuditValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const row: DealAttestation = {
    id: options?.id ?? crypto.randomUUID(),
    dealId: input.dealId,
    attestedBy: input.attestedBy ?? null,
    attestedAt: input.attestedAt ?? now,
    method: input.method,
    seatsBySession: { ...input.seatsBySession },
    createdAt: now,
    updatedAt: now,
  };
  store.attestations.set(row.id, row);
  return row;
}

export function createClickEvent(
  store: DealAuditStore,
  input: CreateClickEventInput,
  options?: { id?: string; now?: string }
): ClickEvent {
  const errors = validateClickEventInput(input);
  if (errors.length) throw new DealAuditValidationError(errors);

  for (const existing of store.clicks.values()) {
    if (existing.clickId === input.clickId) {
      throw new DealAuditValidationError([
        { field: "click_id", message: "click_id must be unique" },
      ]);
    }
  }

  const now = options?.now ?? new Date().toISOString();
  const row: ClickEvent = {
    id: options?.id ?? crypto.randomUUID(),
    dealId: input.dealId,
    dealSessionId: input.dealSessionId ?? null,
    clickId: input.clickId,
    visitorId: input.visitorId ?? null,
    recheckResult: input.recheckResult ?? null,
    redirectUrl: input.redirectUrl ?? null,
    createdAt: now,
  };
  store.clicks.set(row.id, row);
  return row;
}

/**
 * Idempotent upsert on (deal_id, date). Counts replace when provided.
 */
export function upsertDealMetricDaily(
  store: DealAuditStore,
  input: UpsertDealMetricDailyInput,
  options?: { id?: string; now?: string }
): DealMetricDaily {
  const errors = validateDealMetricDailyInput(input);
  if (errors.length) throw new DealAuditValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const key = metricKey(input.dealId, input.date);
  const existing = [...store.metrics.values()].find(
    (m) => m.dealId === input.dealId && m.date === input.date
  );

  if (existing) {
    const updated: DealMetricDaily = {
      ...existing,
      impressions: input.impressions ?? existing.impressions,
      detailViews: input.detailViews ?? existing.detailViews,
      bookingClicks: input.bookingClicks ?? existing.bookingClicks,
      soldOutOnClick: input.soldOutOnClick ?? existing.soldOutOnClick,
      attributedBookings:
        input.attributedBookings ?? existing.attributedBookings,
      attributedRevenueMinor:
        input.attributedRevenueMinor ?? existing.attributedRevenueMinor,
      updatedAt: now,
    };
    store.metrics.set(existing.id, updated);
    return updated;
  }

  const row: DealMetricDaily = {
    id: options?.id ?? crypto.randomUUID(),
    dealId: input.dealId,
    date: input.date,
    impressions: input.impressions ?? 0,
    detailViews: input.detailViews ?? 0,
    bookingClicks: input.bookingClicks ?? 0,
    soldOutOnClick: input.soldOutOnClick ?? 0,
    attributedBookings: input.attributedBookings ?? 0,
    attributedRevenueMinor: input.attributedRevenueMinor ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  store.metrics.set(row.id, row);
  // Keep key map consistency for callers that look up by composite (optional)
  void key;
  return row;
}

export function createDealTemplate(
  store: DealAuditStore,
  input: CreateDealTemplateInput,
  options?: { id?: string; now?: string }
): DealTemplate {
  const errors = validateDealTemplateInput(input);
  if (errors.length) throw new DealAuditValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const row: DealTemplate = {
    id: options?.id ?? crypto.randomUUID(),
    operatorId: input.operatorId,
    name: input.name.trim(),
    payload: input.payload ? { ...input.payload } : {},
    createdAt: now,
    updatedAt: now,
  };
  store.templates.set(row.id, row);
  return row;
}

export function renameDealTemplate(
  store: DealAuditStore,
  templateId: string,
  name: string,
  options?: { now?: string }
): DealTemplate {
  const existing = store.templates.get(templateId);
  if (!existing) {
    throw new DealAuditValidationError([
      { field: "id", message: "template not found" },
    ]);
  }
  const errors = validateDealTemplateInput({
    operatorId: existing.operatorId,
    name,
    payload: existing.payload,
  });
  if (errors.length) throw new DealAuditValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const updated: DealTemplate = {
    ...existing,
    name: name.trim(),
    updatedAt: now,
  };
  store.templates.set(templateId, updated);
  return updated;
}

export function deleteDealTemplate(
  store: DealAuditStore,
  templateId: string
): void {
  if (!store.templates.has(templateId)) {
    throw new DealAuditValidationError([
      { field: "id", message: "template not found" },
    ]);
  }
  store.templates.delete(templateId);
}
