/**
 * Deal draft API (deals platform Chunk 12).
 *
 * Create / get / update / duplicate / delete drafts for marketplace.operator_deals.
 * Status / pause_* remain system-owned (deal-status.ts). Publish validation via
 * deal-publish-validation.ts (Chunk 16).
 *
 * Persistence: in-memory store (same pattern as Chunks 3–11). HTTP routes under
 * /api/marketplace/operators/... and /api/marketplace/operator-deals/... call
 * these functions.
 */

import {
  createDealAuditStore,
  createDealTemplate,
  listDealEvents,
  type DealAuditStore,
  type DealEvent,
  type DealTemplate,
} from "./deal-audit";
import {
  addDealMedia,
  createDealMediaStore,
  listDealMedia,
  type DealMedia,
  type DealMediaStore,
} from "./deal-media";
import {
  assertValidDealFields,
  DealValidationError,
  type Deal,
  type DealFieldInput,
  type FieldError,
} from "./deal";
import type { DealPriceOption, DealSession, DiscountStep } from "./deal-session";
import {
  applyClientDealFieldPatch,
  DealNotFoundError,
  logDealEvent,
  makeDealFixture,
  type DealActor,
  type PublishValidationResult,
} from "./deal-status";
import type { EvidenceUrlCheckRecord, FetchLike } from "./booking-link";
import type {
  AttestationReminderRecord,
  QuickUpdateTokenRecord,
} from "./deal-attestation";
import {
  getPublishButtonLabel,
  type PublishButtonLabel,
} from "./deal-publish";
import {
  validateDealInStore,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import type {
  CapacityMode,
  DealType,
  DiscountMechanism,
  SourceProvider,
} from "./enums";
import {
  INTEGRATED_MECHANISMS,
  MANUAL_MECHANISMS,
  isDealType,
  isDiscountMechanism,
  isIntegratedDealType,
  isManualDealType,
  isSourceProvider,
} from "./enums";
import {
  createOperatorStore,
  getBookingDefaults,
  type Operator,
  type OperatorBookingDefaults,
  type OperatorStore,
} from "./operators";
import { can, type PermissionUser } from "./permissions";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DealDraftError extends Error {
  readonly status: number;
  readonly errors?: FieldError[];

  constructor(message: string, status = 400, errors?: FieldError[]) {
    super(message);
    this.name = "DealDraftError";
    this.status = status;
    this.errors = errors;
  }
}

export class DealDeleteNotAllowedError extends DealDraftError {
  constructor(message = "Only never-published drafts can be deleted") {
    super(message, 409);
    this.name = "DealDeleteNotAllowedError";
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type DealDraftStore = {
  deals: Map<string, Deal>;
  audit: DealAuditStore;
  media: DealMediaStore;
  sessions: Map<string, DealSession>;
  priceOptions: Map<string, DealPriceOption>;
  discountSteps: Map<string, DiscountStep>;
  operators: OperatorStore;
  /** Optional — filled by booking-link checks for publish validation. */
  evidenceUrlChecks?: Map<string, EvidenceUrlCheckRecord>;
  /** Chunk 20: signed quick-update tokens (hash only). */
  quickUpdateTokens?: Map<string, QuickUpdateTokenRecord>;
  /** Chunk 20: attestation reminder dedupe rows. */
  attestationReminders?: Map<string, AttestationReminderRecord>;
};

export function createDealDraftStore(
  operators?: OperatorStore
): DealDraftStore {
  return {
    deals: new Map(),
    audit: createDealAuditStore(),
    media: createDealMediaStore(),
    sessions: new Map(),
    priceOptions: new Map(),
    discountSteps: new Map(),
    operators: operators ?? createOperatorStore(),
    quickUpdateTokens: new Map(),
    attestationReminders: new Map(),
  };
}

/** Seed a session/price option into the draft store (tests / later chunks). */
export function seedDealSession(
  store: DealDraftStore,
  session: DealSession
): DealSession {
  store.sessions.set(session.id, session);
  return session;
}

export function seedDealPriceOption(
  store: DealDraftStore,
  option: DealPriceOption
): DealPriceOption {
  store.priceOptions.set(option.id, option);
  return option;
}

export function seedDealDiscountStep(
  store: DealDraftStore,
  step: DiscountStep
): DiscountStep {
  store.discountSteps.set(step.id, step);
  return step;
}

// ---------------------------------------------------------------------------
// Mechanism / type helpers
// ---------------------------------------------------------------------------

export function mechanismsForDealType(
  dealType: DealType
): readonly DiscountMechanism[] {
  return isManualDealType(dealType) ? MANUAL_MECHANISMS : INTEGRATED_MECHANISMS;
}

export function isMechanismValidForDealType(
  dealType: DealType,
  mechanism: DiscountMechanism | null | undefined
): boolean {
  if (mechanism == null) return true;
  return (mechanismsForDealType(dealType) as readonly string[]).includes(
    mechanism
  );
}

export function defaultCapacityModeForDealType(
  dealType: DealType
): CapacityMode {
  return isManualDealType(dealType) ? "manual_count" : "live_provider";
}

export function defaultSourceProviderForDealType(
  dealType: DealType,
  requested?: SourceProvider | null
): SourceProvider {
  if (isManualDealType(dealType)) return "manual";
  if (requested && isSourceProvider(requested) && requested !== "manual") {
    return requested;
  }
  // Integrated drafts may set provider later (Chunk 32); rezdy is the first.
  return requested && isSourceProvider(requested) ? requested : "rezdy";
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

const SLUG_MAX = 80;

/**
 * Generate a URL slug from a title (or fallback). Lowercase, hyphenated.
 */
export function slugifyDealTitle(title: string, fallback = "deal"): string {
  const base = title
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
  return base || fallback;
}

/**
 * Ensure slug is unique among deals in the store. Appends -2, -3, … as needed.
 */
export function ensureUniqueDealSlug(
  store: DealDraftStore,
  baseSlug: string,
  excludeDealId?: string
): string {
  const root = slugifyDealTitle(baseSlug);
  let candidate = root;
  let n = 2;
  while (true) {
    let taken = false;
    for (const d of store.deals.values()) {
      if (excludeDealId && d.id === excludeDealId) continue;
      if (d.slug === candidate) {
        taken = true;
        break;
      }
    }
    if (!taken) return candidate;
    const suffix = `-${n}`;
    candidate = `${root.slice(0, Math.max(1, SLUG_MAX - suffix.length))}${suffix}`;
    n += 1;
  }
}

// ---------------------------------------------------------------------------
// Prefill from operator defaults
// ---------------------------------------------------------------------------

export type DraftPrefill = Pick<
  Deal,
  | "salesCutoffMinutes"
  | "seatCap"
  | "discountMechanism"
  | "bookingDestinationType"
  | "bookingUrl"
  | "bookingPhone"
  | "bookingEmail"
  | "bookingInstructions"
  | "cancellationPolicyType"
  | "cancellationPolicyText"
  | "currency"
  | "sourceProvider"
  | "capacityMode"
>;

export function prefillFromBookingDefaults(
  dealType: DealType,
  operator: Operator,
  defaults: OperatorBookingDefaults | null,
  options?: { sourceProvider?: SourceProvider | null }
): DraftPrefill {
  const mechanism =
    defaults &&
    isMechanismValidForDealType(dealType, defaults.defaultDiscountMechanism)
      ? defaults.defaultDiscountMechanism
      : null;

  return {
    sourceProvider: defaultSourceProviderForDealType(
      dealType,
      options?.sourceProvider
    ),
    capacityMode: defaultCapacityModeForDealType(dealType),
    currency: operator.currency,
    salesCutoffMinutes: defaults?.defaultSalesCutoffMinutes ?? null,
    seatCap: defaults?.defaultSeatCap ?? null,
    discountMechanism: mechanism,
    bookingDestinationType: defaults?.defaultBookingDestinationType ?? null,
    bookingUrl: defaults?.defaultBookingUrl ?? null,
    bookingPhone: defaults?.defaultBookingPhone ?? null,
    bookingEmail: defaults?.defaultBookingEmail ?? null,
    bookingInstructions: defaults?.defaultBookingInstructions ?? null,
    cancellationPolicyType: defaults?.defaultCancellationPolicyType ?? null,
    cancellationPolicyText: defaults?.defaultCancellationPolicyText ?? null,
  };
}

// ---------------------------------------------------------------------------
// Template / client payload → DealFieldInput
// ---------------------------------------------------------------------------

/** Map snake_case or camelCase client/template keys into DealFieldInput. */
export function dealFieldInputFromClient(
  raw: Record<string, unknown>
): DealFieldInput {
  const get = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (raw[k] !== undefined) return raw[k];
    }
    return undefined;
  };

  const out: DealFieldInput = {};
  const assign = <K extends keyof DealFieldInput>(
    key: K,
    value: unknown
  ): void => {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  };

  assign("dealType", get("dealType", "deal_type"));
  assign("sourceProvider", get("sourceProvider", "source_provider"));
  assign("integrationId", get("integrationId", "integration_id"));
  assign("externalProductId", get("externalProductId", "external_product_id"));
  assign("dealRuleId", get("dealRuleId", "deal_rule_id"));
  assign("status", get("status"));
  assign("pauseReason", get("pauseReason", "pause_reason"));
  assign("pauseDetail", get("pauseDetail", "pause_detail"));
  assign("title", get("title"));
  assign("slug", get("slug"));
  assign("summary", get("summary"));
  assign("description", get("description"));
  assign("category", get("category"));
  assign("tags", get("tags"));
  assign("highlights", get("highlights"));
  assign("inclusions", get("inclusions"));
  assign("exclusions", get("exclusions"));
  assign("whatToBring", get("whatToBring", "what_to_bring"));
  assign("durationMinutes", get("durationMinutes", "duration_minutes"));
  assign("durationLabel", get("durationLabel", "duration_label"));
  assign("locationName", get("locationName", "location_name"));
  assign("address", get("address"));
  assign("latitude", get("latitude"));
  assign("longitude", get("longitude"));
  assign("region", get("region"));
  assign("meetingPointNotes", get("meetingPointNotes", "meeting_point_notes"));
  assign("pickupAvailable", get("pickupAvailable", "pickup_available"));
  assign("pickupNotes", get("pickupNotes", "pickup_notes"));
  assign("minAge", get("minAge", "min_age"));
  assign("ageNotes", get("ageNotes", "age_notes"));
  assign("fitnessLevel", get("fitnessLevel", "fitness_level"));
  assign(
    "wheelchairAccessible",
    get("wheelchairAccessible", "wheelchair_accessible")
  );
  assign(
    "accessibilityNotes",
    get("accessibilityNotes", "accessibility_notes")
  );
  assign("languages", get("languages"));
  assign("weatherDependent", get("weatherDependent", "weather_dependent"));
  assign("weatherNotes", get("weatherNotes", "weather_notes"));
  assign(
    "cancellationPolicyType",
    get("cancellationPolicyType", "cancellation_policy_type")
  );
  assign(
    "cancellationPolicyText",
    get("cancellationPolicyText", "cancellation_policy_text")
  );
  assign("importantInfo", get("importantInfo", "important_info"));
  assign("overriddenFields", get("overriddenFields", "overridden_fields"));
  assign("currency", get("currency"));
  assign("discountMechanism", get("discountMechanism", "discount_mechanism"));
  assign("promoCode", get("promoCode", "promo_code"));
  assign("discountInputMode", get("discountInputMode", "discount_input_mode"));
  assign(
    "steppedDiscountEnabled",
    get("steppedDiscountEnabled", "stepped_discount_enabled")
  );
  assign("capacityMode", get("capacityMode", "capacity_mode"));
  assign("seatCap", get("seatCap", "seat_cap"));
  assign("minBookingQty", get("minBookingQty", "min_booking_qty"));
  assign("maxBookingQty", get("maxBookingQty", "max_booking_qty"));
  assign(
    "bookingDestinationType",
    get("bookingDestinationType", "booking_destination_type")
  );
  assign("bookingUrl", get("bookingUrl", "booking_url"));
  assign("bookingPhone", get("bookingPhone", "booking_phone"));
  assign("bookingEmail", get("bookingEmail", "booking_email"));
  assign(
    "bookingInstructions",
    get("bookingInstructions", "booking_instructions")
  );
  assign(
    "appendTrackingParams",
    get("appendTrackingParams", "append_tracking_params")
  );
  assign("linkStatus", get("linkStatus", "link_status"));
  assign("salesCutoffMinutes", get("salesCutoffMinutes", "sales_cutoff_minutes"));

  return out;
}

/** Content + booking fields copied when duplicating (not status/system). */
const DUPLICATE_CONTENT_KEYS: ReadonlyArray<keyof Deal> = [
  "dealType",
  "sourceProvider",
  "integrationId",
  "externalProductId",
  "title",
  "summary",
  "description",
  "category",
  "tags",
  "highlights",
  "inclusions",
  "exclusions",
  "whatToBring",
  "durationMinutes",
  "durationLabel",
  "locationName",
  "address",
  "latitude",
  "longitude",
  "region",
  "meetingPointNotes",
  "pickupAvailable",
  "pickupNotes",
  "minAge",
  "ageNotes",
  "fitnessLevel",
  "wheelchairAccessible",
  "accessibilityNotes",
  "languages",
  "weatherDependent",
  "weatherNotes",
  "cancellationPolicyType",
  "cancellationPolicyText",
  "importantInfo",
  "overriddenFields",
  "currency",
  "discountMechanism",
  "promoCode",
  "discountInputMode",
  "steppedDiscountEnabled",
  "capacityMode",
  "seatCap",
  "minBookingQty",
  "maxBookingQty",
  "bookingDestinationType",
  "bookingUrl",
  "bookingPhone",
  "bookingEmail",
  "bookingInstructions",
  "appendTrackingParams",
  "salesCutoffMinutes",
];

function copyOfTitle(title: string | null): string {
  const base = title?.trim() ? title.trim() : "Untitled deal";
  const prefix = "Copy of ";
  const max = 80;
  if (prefix.length + base.length <= max) return `${prefix}${base}`;
  return `${prefix}${base.slice(0, max - prefix.length)}`.trimEnd();
}

function changedFieldNames(
  before: Deal,
  after: Deal
): string[] {
  const names: string[] = [];
  const keys = Object.keys(after) as Array<keyof Deal>;
  for (const key of keys) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      names.push(camelToSnake(String(key)));
    }
  }
  return names;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateDraftDealInput = {
  operatorId: string;
  dealType: DealType;
  /** Optional provider for integrated types (ignored for manual). */
  sourceProvider?: SourceProvider | null;
  templateId?: string | null;
  duplicateOf?: string | null;
  actor: DealActor;
  now?: string;
  id?: string;
};

/**
 * Create a draft deal. Prefills from OperatorBookingDefaults + operator currency.
 * Logs `created`. When `duplicateOf` is set, delegates to duplicateDeal.
 */
export function createDraftDeal(
  store: DealDraftStore,
  input: CreateDraftDealInput
): Deal {
  if (input.duplicateOf) {
    return duplicateDeal(store, input.duplicateOf, {
      actor: input.actor,
      now: input.now,
      id: input.id,
    });
  }

  if (!isDealType(input.dealType)) {
    throw new DealDraftError("deal_type is required and must be a valid type", 400, [
      { field: "deal_type", message: "invalid value" },
    ]);
  }

  const operator = store.operators.operators.get(input.operatorId);
  if (!operator) {
    throw new DealDraftError("Operator not found", 404);
  }

  if (input.templateId) {
    const template = store.audit.templates.get(input.templateId);
    if (!template || template.operatorId !== input.operatorId) {
      throw new DealDraftError("template_id not found for this operator", 404, [
        { field: "template_id", message: "not found" },
      ]);
    }
  }

  const now = input.now ?? new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();
  const defaults = getBookingDefaults(store.operators, input.operatorId);
  const prefill = prefillFromBookingDefaults(
    input.dealType,
    operator,
    defaults,
    { sourceProvider: input.sourceProvider }
  );

  let templatePatch: DealFieldInput = {};
  if (input.templateId) {
    const template = store.audit.templates.get(input.templateId)!;
    templatePatch = dealFieldInputFromClient(
      template.payload as Record<string, unknown>
    );
    // Template must not override type / system fields chosen at create.
    delete templatePatch.dealType;
    delete templatePatch.status;
    delete templatePatch.pauseReason;
    delete templatePatch.pauseDetail;
    delete templatePatch.slug;
  }

  if (
    templatePatch.discountMechanism != null &&
    !isMechanismValidForDealType(
      input.dealType,
      templatePatch.discountMechanism
    )
  ) {
    templatePatch.discountMechanism = prefill.discountMechanism;
  }

  // Manual types always force provider + capacity regardless of template.
  const sourceProvider = isManualDealType(input.dealType)
    ? "manual"
    : prefill.sourceProvider;
  const capacityMode = isManualDealType(input.dealType)
    ? "manual_count"
    : (templatePatch.capacityMode as CapacityMode | undefined) ??
      prefill.capacityMode;

  const slug = ensureUniqueDealSlug(
    store,
    templatePatch.title
      ? slugifyDealTitle(String(templatePatch.title))
      : `draft-${id.slice(0, 8)}`
  );

  const deal = makeDealFixture({
    id,
    operatorId: input.operatorId,
    dealType: input.dealType,
    sourceProvider,
    capacityMode,
    status: "draft",
    pauseReason: null,
    pauseDetail: null,
    slug,
    currency: prefill.currency,
    salesCutoffMinutes: prefill.salesCutoffMinutes,
    seatCap: prefill.seatCap,
    discountMechanism: prefill.discountMechanism,
    bookingDestinationType: prefill.bookingDestinationType,
    bookingUrl: prefill.bookingUrl,
    bookingPhone: prefill.bookingPhone,
    bookingEmail: prefill.bookingEmail,
    bookingInstructions: prefill.bookingInstructions,
    cancellationPolicyType: prefill.cancellationPolicyType,
    cancellationPolicyText: prefill.cancellationPolicyText,
    createdBy: input.actor.id ?? null,
    updatedBy: input.actor.id ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const withTemplate = applyClientDealFieldPatch(deal, templatePatch, { now });
  // Re-assert forced manual / capacity rules after template merge.
  const finalDeal: Deal = {
    ...withTemplate,
    dealType: input.dealType,
    sourceProvider,
    capacityMode,
    status: "draft",
    pauseReason: null,
    pauseDetail: null,
    slug: withTemplate.title
      ? ensureUniqueDealSlug(
          store,
          slugifyDealTitle(withTemplate.title),
          id
        )
      : slug,
    firstPublishedAt: null,
    publishedAt: null,
    endedAt: null,
  };

  assertValidDealFields({
    dealType: finalDeal.dealType,
    sourceProvider: finalDeal.sourceProvider,
    title: finalDeal.title,
    summary: finalDeal.summary,
    description: finalDeal.description,
    category: finalDeal.category,
    tags: finalDeal.tags,
    highlights: finalDeal.highlights,
    inclusions: finalDeal.inclusions,
    exclusions: finalDeal.exclusions,
    whatToBring: finalDeal.whatToBring,
    durationMinutes: finalDeal.durationMinutes,
    meetingPointNotes: finalDeal.meetingPointNotes,
    pickupNotes: finalDeal.pickupNotes,
    minAge: finalDeal.minAge,
    fitnessLevel: finalDeal.fitnessLevel,
    accessibilityNotes: finalDeal.accessibilityNotes,
    languages: finalDeal.languages,
    cancellationPolicyType: finalDeal.cancellationPolicyType,
    cancellationPolicyText: finalDeal.cancellationPolicyText,
    importantInfo: finalDeal.importantInfo,
    currency: finalDeal.currency,
    discountMechanism: finalDeal.discountMechanism,
    promoCode: finalDeal.promoCode,
    discountInputMode: finalDeal.discountInputMode,
    capacityMode: finalDeal.capacityMode,
    seatCap: finalDeal.seatCap,
    minBookingQty: finalDeal.minBookingQty,
    maxBookingQty: finalDeal.maxBookingQty,
    bookingDestinationType: finalDeal.bookingDestinationType,
    bookingInstructions: finalDeal.bookingInstructions,
    salesCutoffMinutes: finalDeal.salesCutoffMinutes,
    latitude: finalDeal.latitude,
    longitude: finalDeal.longitude,
  });

  if (
    finalDeal.discountMechanism != null &&
    !isMechanismValidForDealType(finalDeal.dealType, finalDeal.discountMechanism)
  ) {
    throw new DealDraftError("discount_mechanism is not valid for this deal_type", 400, [
      { field: "discount_mechanism", message: "not valid for deal_type" },
    ]);
  }

  store.deals.set(id, finalDeal);
  logDealEvent(
    store.audit,
    id,
    "created",
    input.actor,
    {
      deal_type: finalDeal.dealType,
      ...(input.templateId ? { template_id: input.templateId } : {}),
    },
    { now }
  );

  return finalDeal;
}

// ---------------------------------------------------------------------------
// Get detail
// ---------------------------------------------------------------------------

export type DealDetail = {
  deal: Deal;
  sessions: DealSession[];
  priceOptions: DealPriceOption[];
  discountSteps: DiscountStep[];
  media: DealMedia[];
  validation: PublishValidationResult | PublishValidationOutcome;
  /** Editor primary CTA label (Chunk 17). */
  publish_button: PublishButtonLabel;
};

export type GetDealDetailOptions = {
  now?: string;
  attested?: boolean;
  fetchFn?: FetchLike;
  /** Default true — probe unchecked/stale booking URLs. */
  refreshStaleLinks?: boolean;
};

export async function getDealDetail(
  store: DealDraftStore,
  dealId: string,
  options?: GetDealDetailOptions
): Promise<DealDetail> {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  const sessions = [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const priceOptions = [...store.priceOptions.values()]
    .filter((p) => p.dealId === dealId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const discountSteps = [...store.discountSteps.values()].filter(
    (s) => s.dealId === dealId
  );
  const media = listDealMedia(store.media, dealId);
  const validation = await validateDealInStore(store, dealId, {
    now: options?.now,
    attested: options?.attested,
    fetchFn: options?.fetchFn,
    refreshStaleLinks: options?.refreshStaleLinks,
  });

  // Re-read deal in case link refresh updated it
  const freshDeal = store.deals.get(dealId) ?? deal;
  const publish_button = getPublishButtonLabel(store, dealId, {
    now: options?.now,
    hasSessionWithinLeadHours:
      "hasSessionWithinLeadHours" in validation
        ? validation.hasSessionWithinLeadHours
        : undefined,
  });

  return {
    deal: freshDeal,
    sessions,
    priceOptions,
    discountSteps,
    media,
    validation,
    publish_button,
  };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export type UpdateDraftDealOptions = {
  actor: DealActor;
  now?: string;
};

/**
 * Partial update. Runs field-level validator; strips status/pause_*;
 * rejects deal_type change after first publish; rejects invalid mechanisms;
 * regenerates slug when title changes while still draft.
 */
export function updateDraftDeal(
  store: DealDraftStore,
  dealId: string,
  rawPatch: Record<string, unknown> | DealFieldInput,
  options: UpdateDraftDealOptions
): Deal {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const patch = dealFieldInputFromClient(rawPatch as Record<string, unknown>);

  if (patch.dealType !== undefined && patch.dealType !== null) {
    if (!isDealType(patch.dealType)) {
      throw new DealDraftError("deal_type is invalid", 400, [
        { field: "deal_type", message: "invalid value" },
      ]);
    }
    if (
      existing.firstPublishedAt != null &&
      patch.dealType !== existing.dealType
    ) {
      throw new DealDraftError(
        "deal_type cannot be changed after first publish",
        400,
        [{ field: "deal_type", message: "locked after first publish" }]
      );
    }
  }

  const nextType = (patch.dealType ?? existing.dealType) as DealType;

  if (patch.discountMechanism !== undefined) {
    if (
      patch.discountMechanism != null &&
      !isDiscountMechanism(patch.discountMechanism)
    ) {
      throw new DealDraftError("discount_mechanism is invalid", 400, [
        { field: "discount_mechanism", message: "invalid value" },
      ]);
    }
    if (!isMechanismValidForDealType(nextType, patch.discountMechanism)) {
      throw new DealDraftError(
        "discount_mechanism is not valid for this deal_type",
        400,
        [{ field: "discount_mechanism", message: "not valid for deal_type" }]
      );
    }
  }

  // Manual types keep forced provider/capacity even if client sends otherwise.
  if (isManualDealType(nextType)) {
    patch.sourceProvider = "manual";
    patch.capacityMode = "manual_count";
  }

  const titleChanging =
    patch.title !== undefined &&
    patch.title !== existing.title &&
    existing.status === "draft";

  let validated: DealFieldInput;
  try {
    validated = assertValidDealFields(patch);
  } catch (err) {
    if (err instanceof DealValidationError) {
      throw new DealDraftError(err.message, 400, err.errors);
    }
    throw err;
  }

  const now = options.now ?? new Date().toISOString();
  let updated = applyClientDealFieldPatch(existing, validated, { now });
  updated = {
    ...updated,
    updatedBy: options.actor.id ?? updated.updatedBy,
  };

  if (titleChanging && updated.title) {
    updated = {
      ...updated,
      slug: ensureUniqueDealSlug(
        store,
        slugifyDealTitle(updated.title),
        dealId
      ),
    };
  }

  const fields = changedFieldNames(existing, updated);
  store.deals.set(dealId, updated);

  if (fields.length > 0) {
    logDealEvent(
      store.audit,
      dealId,
      "updated",
      options.actor,
      { fields },
      { now }
    );
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

export type DuplicateDealOptions = {
  actor: DealActor;
  now?: string;
  id?: string;
};

/**
 * Copy content, media references, price options, booking destination.
 * Does not copy sessions, attestations, status or stats.
 * New draft titled "Copy of …".
 */
export function duplicateDeal(
  store: DealDraftStore,
  sourceDealId: string,
  options: DuplicateDealOptions
): Deal {
  const source = store.deals.get(sourceDealId);
  if (!source) throw new DealNotFoundError(sourceDealId);

  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? crypto.randomUUID();
  const title = copyOfTitle(source.title);
  const slug = ensureUniqueDealSlug(store, slugifyDealTitle(title));

  const copied: Partial<Deal> = {};
  for (const key of DUPLICATE_CONTENT_KEYS) {
    const value = source[key];
    if (Array.isArray(value)) {
      (copied as Record<string, unknown>)[key] = [...value];
    } else {
      (copied as Record<string, unknown>)[key] = value;
    }
  }

  const deal = makeDealFixture({
    ...copied,
    id,
    operatorId: source.operatorId,
    title,
    slug,
    status: "draft",
    pauseReason: null,
    pauseDetail: null,
    linkStatus: "unchecked",
    linkLastCheckedAt: null,
    linkConsecutiveFailures: 0,
    publishAt: null,
    lastAttestedAt: null,
    attestationExpiresAt: null,
    publishedAt: null,
    endedAt: null,
    firstPublishedAt: null,
    dealRuleId: null,
    createdBy: options.actor.id ?? null,
    updatedBy: options.actor.id ?? null,
    createdAt: now,
    updatedAt: now,
  });

  store.deals.set(id, deal);

  // Media references (same URLs / storage keys, new rows).
  for (const m of listDealMedia(store.media, sourceDealId)) {
    addDealMedia(
      store.media,
      {
        dealId: id,
        mediaType: m.mediaType,
        source: m.source,
        url: m.url,
        altText: m.altText,
        storageKey: m.storageKey,
        isCover: m.isCover,
        sortOrder: m.sortOrder,
        caption: m.caption,
        width: m.width,
        height: m.height,
        focalX: m.focalX,
        focalY: m.focalY,
        fileSizeBytes: m.fileSizeBytes,
      },
      { now }
    );
  }

  // Price options (new ids); steps intentionally not copied (Chunk 43).
  for (const opt of [...store.priceOptions.values()].filter(
    (p) => p.dealId === sourceDealId
  )) {
    const newOpt: DealPriceOption = {
      ...opt,
      id: crypto.randomUUID(),
      dealId: id,
      createdAt: now,
      updatedAt: now,
    };
    store.priceOptions.set(newOpt.id, newOpt);
  }

  logDealEvent(
    store.audit,
    id,
    "created",
    options.actor,
    { duplicated_from: sourceDealId },
    { now }
  );

  return deal;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete only drafts that were never published (first_published_at is null).
 */
export function deleteDraftDeal(
  store: DealDraftStore,
  dealId: string
): void {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  if (existing.status !== "draft" || existing.firstPublishedAt != null) {
    throw new DealDeleteNotAllowedError();
  }

  // Cascade children in-memory (DB will CASCADE).
  for (const [sid, s] of store.sessions) {
    if (s.dealId === dealId) store.sessions.delete(sid);
  }
  for (const [pid, p] of store.priceOptions) {
    if (p.dealId === dealId) store.priceOptions.delete(pid);
  }
  for (const [stid, st] of store.discountSteps) {
    if (st.dealId === dealId) store.discountSteps.delete(stid);
  }
  for (const m of listDealMedia(store.media, dealId)) {
    store.media.media.delete(m.id);
  }

  store.deals.delete(dealId);
}

// ---------------------------------------------------------------------------
// Permission helpers for routes / tests
// ---------------------------------------------------------------------------

export function assertCanWriteDeal(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "inventory.write")) {
    throw new DealDraftError(
      `Forbidden: missing permission "inventory.write" for this operator.`,
      403
    );
  }
}

export function assertCanReadDeal(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "inventory.read")) {
    throw new DealDraftError(
      `Forbidden: missing permission "inventory.read" for this operator.`,
      403
    );
  }
}

export function listDealCreatedEvents(
  store: DealDraftStore,
  dealId: string
): DealEvent[] {
  return listDealEvents(store.audit, dealId).filter(
    (e) => e.eventType === "created"
  );
}

/** Re-export template helper for tests that seed templates into the draft store. */
export { createDealTemplate };
export type { DealTemplate };
