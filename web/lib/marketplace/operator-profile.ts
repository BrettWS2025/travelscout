/**
 * Business profile and deal defaults (deals platform Chunk 38).
 *
 * Routes:
 * - GET|PATCH /api/marketplace/operators/:id/profile
 * - POST .../profile/logo | .../profile/cover
 * - GET .../preview
 * - GET|PATCH .../booking-defaults
 *
 * account_status / requires_manual_review are admin-only (stripped on operator PATCH).
 * Staff: profile read-only. Changing defaults never edits existing deals.
 */

import {
  isE164Phone,
  isHttpsUrl,
  isValidBookingEmail,
} from "./booking-destination";
import type { DealDraftStore } from "./deal-draft";
import { DealDraftError } from "./deal-draft";
import { ISO_639_1_REGEX } from "./deal";
import {
  DEAL_MEDIA_LIMITS,
  type AllowedImageMimeType,
} from "./deal-media";
import {
  ImageProbeError,
  readImageDimensions,
} from "./image-dimensions";
import {
  extensionForMime,
  getMediaStorage,
  type MediaStorage,
} from "./media-storage";
import {
  BOOKING_DEFAULTS_NOTE,
  OperatorValidationError,
  getBookingDefaults,
  isIso4217Currency,
  isValidIanaTimezone,
  validateBookingDefaultsPatch,
  validateOperatorFields,
  type CreateOperatorInput,
  type Operator,
  type OperatorBookingDefaults,
} from "./operators";

export { BOOKING_DEFAULTS_NOTE };
import { can, type PermissionUser } from "./permissions";
import { PLATFORM_REGIONS, isPlatformRegion } from "./settings";
import type {
  AccountStatus,
  BookingDestinationType,
  CancellationPolicyType,
  DiscountMechanism,
} from "./enums";
import {
  isAccountStatus,
  isBookingDestinationType,
  isCancellationPolicyType,
  isDiscountMechanism,
} from "./enums";

// ---------------------------------------------------------------------------
// Upload limits (reuse media pipeline MIME/size; softer mins for branding)
// ---------------------------------------------------------------------------

export const OPERATOR_IMAGE_LIMITS = {
  maxFileSizeBytes: DEAL_MEDIA_LIMITS.maxFileSizeBytes,
  allowedMimeTypes: DEAL_MEDIA_LIMITS.allowedMimeTypes,
  logo: { minWidthPx: 200, minHeightPx: 200 },
  cover: { minWidthPx: 1200, minHeightPx: 400 },
} as const;

export type OperatorImageKind = "logo" | "cover";

// ---------------------------------------------------------------------------
// Serializers (snake_case API)
// ---------------------------------------------------------------------------

export function serializeOperator(op: Operator): Record<string, unknown> {
  return {
    id: op.id,
    legal_name: op.legalName,
    trading_name: op.tradingName,
    slug: op.slug,
    logo: op.logo ?? null,
    cover_image: op.coverImage ?? null,
    short_description: op.shortDescription ?? null,
    long_description: op.longDescription ?? null,
    website: op.website ?? null,
    public_email: op.publicEmail ?? null,
    public_phone: op.publicPhone ?? null,
    internal_email: op.internalEmail ?? null,
    internal_phone: op.internalPhone ?? null,
    address: op.address ?? null,
    regions_served: op.regionsServed,
    timezone: op.timezone,
    currency: op.currency,
    languages: op.languages,
    gst_number: op.gstNumber ?? null,
    nzbn: op.nzbn ?? null,
    social_links: op.socialLinks,
    account_status: op.accountStatus,
    requires_manual_review: op.requiresManualReview,
    created_at: op.createdAt,
    updated_at: op.updatedAt,
  };
}

/** Public operator page payload — no internal contacts or admin flags. */
export function serializeOperatorPreview(
  op: Operator
): Record<string, unknown> {
  return {
    id: op.id,
    trading_name: op.tradingName,
    slug: op.slug,
    logo: op.logo ?? null,
    cover_image: op.coverImage ?? null,
    short_description: op.shortDescription ?? null,
    long_description: op.longDescription ?? null,
    website: op.website ?? null,
    public_email: op.publicEmail ?? null,
    public_phone: op.publicPhone ?? null,
    address: op.address ?? null,
    regions_served: op.regionsServed,
    timezone: op.timezone,
    currency: op.currency,
    languages: op.languages,
    social_links: op.socialLinks,
  };
}

export function serializeBookingDefaults(
  defaults: OperatorBookingDefaults
): Record<string, unknown> {
  return {
    id: defaults.id,
    operator_id: defaults.operatorId,
    default_sales_cutoff_minutes: defaults.defaultSalesCutoffMinutes,
    default_seat_cap: defaults.defaultSeatCap,
    default_discount_pct: defaults.defaultDiscountPct,
    default_discount_mechanism: defaults.defaultDiscountMechanism,
    default_booking_destination_type: defaults.defaultBookingDestinationType,
    default_booking_url: defaults.defaultBookingUrl ?? null,
    default_booking_phone: defaults.defaultBookingPhone ?? null,
    default_booking_email: defaults.defaultBookingEmail ?? null,
    default_booking_instructions: defaults.defaultBookingInstructions ?? null,
    default_cancellation_policy_type: defaults.defaultCancellationPolicyType,
    default_cancellation_policy_text:
      defaults.defaultCancellationPolicyText ?? null,
    default_attestation_reminder_hours:
      defaults.defaultAttestationReminderHours,
    created_at: defaults.createdAt,
    updated_at: defaults.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Patch parsing
// ---------------------------------------------------------------------------

/** Admin-only keys — never accepted from operator settings PATCH. */
export const ADMIN_ONLY_OPERATOR_FIELDS = [
  "account_status",
  "requires_manual_review",
  "accountStatus",
  "requiresManualReview",
] as const;

export type OperatorProfilePatch = Partial<
  Omit<
    CreateOperatorInput,
    "accountStatus" | "requiresManualReview" | "slug"
  > & {
    /** Slug may be updated while unique. */
    slug?: string;
  }
>;

function getRaw(
  raw: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined) return raw[k];
  }
  return undefined;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value !== "string") {
    throw new OperatorValidationError([
      { field: "value", message: "must be a string" },
    ]);
  }
  return value;
}

function asOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string")) {
    throw new OperatorValidationError([
      { field, message: "must be an array of strings" },
    ]);
  }
  return value as string[];
}

/**
 * Parse client body (snake or camel) into a profile patch.
 * Strips admin-only fields. Does not validate — call validateOperatorFields.
 */
export function operatorProfilePatchFromClient(
  raw: Record<string, unknown>
): OperatorProfilePatch {
  const patch: OperatorProfilePatch = {};

  const str = (
    camel: keyof OperatorProfilePatch,
    ...keys: string[]
  ): void => {
    const v = getRaw(raw, ...keys);
    if (v === undefined) return;
    if (v !== null && typeof v !== "string") {
      throw new OperatorValidationError([
        { field: keys[0]!, message: "must be a string" },
      ]);
    }
    (patch as Record<string, unknown>)[camel] = v === null ? "" : v;
  };

  str("legalName", "legal_name", "legalName");
  str("tradingName", "trading_name", "tradingName");
  str("slug", "slug");
  str("logo", "logo");
  str("coverImage", "cover_image", "coverImage");
  str("shortDescription", "short_description", "shortDescription");
  str("longDescription", "long_description", "longDescription");
  str("website", "website");
  str("publicEmail", "public_email", "publicEmail");
  str("publicPhone", "public_phone", "publicPhone");
  str("internalEmail", "internal_email", "internalEmail");
  str("internalPhone", "internal_phone", "internalPhone");
  str("address", "address");
  str("timezone", "timezone");
  str("currency", "currency");
  str("gstNumber", "gst_number", "gstNumber");
  str("nzbn", "nzbn");

  const regions = getRaw(raw, "regions_served", "regionsServed");
  if (regions !== undefined) {
    patch.regionsServed = asOptionalStringArray(
      regions,
      "regions_served"
    );
  }

  const languages = getRaw(raw, "languages");
  if (languages !== undefined) {
    patch.languages = asOptionalStringArray(languages, "languages");
  }

  const social = getRaw(raw, "social_links", "socialLinks");
  if (social !== undefined) {
    if (social === null) {
      patch.socialLinks = {};
    } else if (
      typeof social === "object" &&
      !Array.isArray(social)
    ) {
      patch.socialLinks = social as Record<string, unknown>;
    } else {
      throw new OperatorValidationError([
        { field: "social_links", message: "must be an object" },
      ]);
    }
  }

  // Explicitly ignore admin-only keys (do not error — mirror deal status strip).
  void asOptionalString;
  void ADMIN_ONLY_OPERATOR_FIELDS;

  return patch;
}

export type BookingDefaultsPatch = Partial<
  Omit<OperatorBookingDefaults, "id" | "operatorId" | "createdAt" | "updatedAt">
>;

export function bookingDefaultsPatchFromClient(
  raw: Record<string, unknown>
): BookingDefaultsPatch {
  const patch: BookingDefaultsPatch = {};

  const intField = (
    camel: keyof BookingDefaultsPatch,
    ...keys: string[]
  ): void => {
    const v = getRaw(raw, ...keys);
    if (v === undefined) return;
    if (v === null) {
      (patch as Record<string, unknown>)[camel] = null;
      return;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new OperatorValidationError([
        { field: keys[0]!, message: "must be a number" },
      ]);
    }
    (patch as Record<string, unknown>)[camel] = v;
  };

  const strField = (
    camel: keyof BookingDefaultsPatch,
    ...keys: string[]
  ): void => {
    const v = getRaw(raw, ...keys);
    if (v === undefined) return;
    if (v !== null && typeof v !== "string") {
      throw new OperatorValidationError([
        { field: keys[0]!, message: "must be a string" },
      ]);
    }
    (patch as Record<string, unknown>)[camel] =
      v === null ? undefined : v;
  };

  intField(
    "defaultSalesCutoffMinutes",
    "default_sales_cutoff_minutes",
    "defaultSalesCutoffMinutes"
  );
  intField("defaultSeatCap", "default_seat_cap", "defaultSeatCap");
  intField(
    "defaultDiscountPct",
    "default_discount_pct",
    "defaultDiscountPct"
  );
  intField(
    "defaultAttestationReminderHours",
    "default_attestation_reminder_hours",
    "defaultAttestationReminderHours"
  );

  const mech = getRaw(
    raw,
    "default_discount_mechanism",
    "defaultDiscountMechanism"
  );
  if (mech !== undefined) {
    if (typeof mech !== "string" || !isDiscountMechanism(mech)) {
      throw new OperatorValidationError([
        {
          field: "default_discount_mechanism",
          message: "invalid value",
        },
      ]);
    }
    patch.defaultDiscountMechanism = mech as DiscountMechanism;
  }

  const dest = getRaw(
    raw,
    "default_booking_destination_type",
    "defaultBookingDestinationType"
  );
  if (dest !== undefined) {
    if (typeof dest !== "string" || !isBookingDestinationType(dest)) {
      throw new OperatorValidationError([
        {
          field: "default_booking_destination_type",
          message: "invalid value",
        },
      ]);
    }
    patch.defaultBookingDestinationType = dest as BookingDestinationType;
  }

  const cancel = getRaw(
    raw,
    "default_cancellation_policy_type",
    "defaultCancellationPolicyType"
  );
  if (cancel !== undefined) {
    if (typeof cancel !== "string" || !isCancellationPolicyType(cancel)) {
      throw new OperatorValidationError([
        {
          field: "default_cancellation_policy_type",
          message: "invalid value",
        },
      ]);
    }
    patch.defaultCancellationPolicyType = cancel as CancellationPolicyType;
  }

  strField(
    "defaultBookingUrl",
    "default_booking_url",
    "defaultBookingUrl"
  );
  strField(
    "defaultBookingPhone",
    "default_booking_phone",
    "defaultBookingPhone"
  );
  strField(
    "defaultBookingEmail",
    "default_booking_email",
    "defaultBookingEmail"
  );
  strField(
    "defaultBookingInstructions",
    "default_booking_instructions",
    "defaultBookingInstructions"
  );
  strField(
    "defaultCancellationPolicyText",
    "default_cancellation_policy_text",
    "defaultCancellationPolicyText"
  );

  return patch;
}

// ---------------------------------------------------------------------------
// Permissions helpers
// ---------------------------------------------------------------------------

export function requireProfileRead(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "settings.profile.read")) {
    throw new DealDraftError(
      "You do not have permission to view this business profile.",
      403
    );
  }
}

export function requireProfileWrite(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "settings.profile.write")) {
    throw new DealDraftError(
      "You do not have permission to edit this business profile.",
      403
    );
  }
}

export function requireDefaultsAccess(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "settings.defaults")) {
    throw new DealDraftError(
      "You do not have permission to manage deal defaults.",
      403
    );
  }
}

// ---------------------------------------------------------------------------
// Profile get / patch
// ---------------------------------------------------------------------------

function requireOperator(
  store: DealDraftStore,
  operatorId: string
): Operator {
  const op = store.operators.operators.get(operatorId);
  if (!op) {
    throw new DealDraftError("Operator not found", 404);
  }
  return op;
}

export function getOperatorProfile(
  store: DealDraftStore,
  operatorId: string
): Operator {
  return requireOperator(store, operatorId);
}

export function getOperatorPreview(
  store: DealDraftStore,
  operatorId: string
): Operator {
  return requireOperator(store, operatorId);
}

/**
 * Partial update of operator profile fields.
 * Never applies account_status / requires_manual_review from the client.
 */
export function updateOperatorProfile(
  store: DealDraftStore,
  operatorId: string,
  rawPatch: Record<string, unknown>,
  options?: { now?: string; isPlatformAdmin?: boolean }
): Operator {
  const existing = requireOperator(store, operatorId);
  const patch = operatorProfilePatchFromClient(rawPatch);

  // Platform admins may set admin-only fields via this same endpoint when flagged.
  let accountStatus: AccountStatus | undefined;
  let requiresManualReview: boolean | undefined;
  if (options?.isPlatformAdmin) {
    const statusRaw = getRaw(rawPatch, "account_status", "accountStatus");
    if (statusRaw !== undefined) {
      if (typeof statusRaw !== "string" || !isAccountStatus(statusRaw)) {
        throw new OperatorValidationError([
          { field: "account_status", message: "invalid value" },
        ]);
      }
      accountStatus = statusRaw;
    }
    const reviewRaw = getRaw(
      rawPatch,
      "requires_manual_review",
      "requiresManualReview"
    );
    if (reviewRaw !== undefined) {
      if (typeof reviewRaw !== "boolean") {
        throw new OperatorValidationError([
          { field: "requires_manual_review", message: "must be a boolean" },
        ]);
      }
      requiresManualReview = reviewRaw;
    }
  }

  const mergedInput: CreateOperatorInput = {
    legalName: patch.legalName ?? existing.legalName,
    tradingName: patch.tradingName ?? existing.tradingName,
    slug: patch.slug ?? existing.slug,
    logo: patch.logo !== undefined ? patch.logo || undefined : existing.logo,
    coverImage:
      patch.coverImage !== undefined
        ? patch.coverImage || undefined
        : existing.coverImage,
    shortDescription:
      patch.shortDescription !== undefined
        ? patch.shortDescription || undefined
        : existing.shortDescription,
    longDescription:
      patch.longDescription !== undefined
        ? patch.longDescription || undefined
        : existing.longDescription,
    website:
      patch.website !== undefined
        ? patch.website || undefined
        : existing.website,
    publicEmail:
      patch.publicEmail !== undefined
        ? patch.publicEmail || undefined
        : existing.publicEmail,
    publicPhone:
      patch.publicPhone !== undefined
        ? patch.publicPhone || undefined
        : existing.publicPhone,
    internalEmail:
      patch.internalEmail !== undefined
        ? patch.internalEmail || undefined
        : existing.internalEmail,
    internalPhone:
      patch.internalPhone !== undefined
        ? patch.internalPhone || undefined
        : existing.internalPhone,
    address:
      patch.address !== undefined
        ? patch.address || undefined
        : existing.address,
    regionsServed: patch.regionsServed ?? existing.regionsServed,
    timezone: patch.timezone ?? existing.timezone,
    currency: patch.currency ?? existing.currency,
    languages: patch.languages ?? existing.languages,
    gstNumber:
      patch.gstNumber !== undefined
        ? patch.gstNumber || undefined
        : existing.gstNumber,
    nzbn: patch.nzbn !== undefined ? patch.nzbn || undefined : existing.nzbn,
    socialLinks: patch.socialLinks ?? existing.socialLinks,
    accountStatus: accountStatus ?? existing.accountStatus,
    requiresManualReview:
      requiresManualReview ?? existing.requiresManualReview,
  };

  const errors = validateOperatorFields(mergedInput);
  if (errors.length) throw new OperatorValidationError(errors);

  const nextSlug = mergedInput.slug.trim();
  if (nextSlug !== existing.slug) {
    for (const other of store.operators.operators.values()) {
      if (other.id !== operatorId && other.slug === nextSlug) {
        throw new OperatorValidationError([
          { field: "slug", message: "must be unique" },
        ]);
      }
    }
  }

  const now = options?.now ?? new Date().toISOString();
  const updated: Operator = {
    ...existing,
    legalName: mergedInput.legalName.trim(),
    tradingName: mergedInput.tradingName.trim(),
    slug: nextSlug,
    logo: mergedInput.logo,
    coverImage: mergedInput.coverImage,
    shortDescription: mergedInput.shortDescription,
    longDescription: mergedInput.longDescription,
    website: mergedInput.website,
    publicEmail: mergedInput.publicEmail,
    publicPhone: mergedInput.publicPhone,
    internalEmail: mergedInput.internalEmail,
    internalPhone: mergedInput.internalPhone,
    address: mergedInput.address,
    regionsServed: mergedInput.regionsServed ?? [],
    timezone: mergedInput.timezone ?? existing.timezone,
    currency: mergedInput.currency ?? existing.currency,
    languages: mergedInput.languages ?? [],
    gstNumber: mergedInput.gstNumber,
    nzbn: mergedInput.nzbn,
    socialLinks: mergedInput.socialLinks ?? {},
    accountStatus: mergedInput.accountStatus ?? existing.accountStatus,
    requiresManualReview:
      mergedInput.requiresManualReview ?? existing.requiresManualReview,
    updatedAt: now,
  };

  store.operators.operators.set(operatorId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Booking defaults
// ---------------------------------------------------------------------------

export function getOperatorBookingDefaults(
  store: DealDraftStore,
  operatorId: string
): OperatorBookingDefaults {
  requireOperator(store, operatorId);
  const defaults = getBookingDefaults(store.operators, operatorId);
  if (!defaults) {
    throw new DealDraftError("Booking defaults not found", 404);
  }
  return defaults;
}

/**
 * Patch booking defaults. Never mutates existing deals — createDraftDeal
 * reads defaults at create time only.
 */
export function updateOperatorBookingDefaults(
  store: DealDraftStore,
  operatorId: string,
  rawPatch: Record<string, unknown>,
  options?: { now?: string }
): OperatorBookingDefaults {
  const existing = getOperatorBookingDefaults(store, operatorId);
  const patch = bookingDefaultsPatchFromClient(rawPatch);
  const errors = validateBookingDefaultsPatch(patch);
  if (errors.length) throw new OperatorValidationError(errors);

  const now = options?.now ?? new Date().toISOString();
  const updated: OperatorBookingDefaults = {
    ...existing,
    ...patch,
    // Explicit null seat cap
    defaultSeatCap:
      patch.defaultSeatCap !== undefined
        ? patch.defaultSeatCap
        : existing.defaultSeatCap,
    updatedAt: now,
  };

  store.operators.bookingDefaults.set(operatorId, updated);
  return updated;
}

export function bookingDefaultsResponse(
  defaults: OperatorBookingDefaults
): Record<string, unknown> {
  return {
    ...serializeBookingDefaults(defaults),
    note: BOOKING_DEFAULTS_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Logo / cover upload (media pipeline)
// ---------------------------------------------------------------------------

function buildOperatorImageKey(
  operatorId: string,
  kind: OperatorImageKind,
  fileId: string,
  ext: string
): string {
  return `operators/${operatorId}/profile/${kind}-${fileId}.${ext}`;
}

function validateOperatorImageBytes(
  bytes: Uint8Array,
  kind: OperatorImageKind,
  contentType?: string | null
): {
  mime: AllowedImageMimeType;
  width: number;
  height: number;
  sizeBytes: number;
} {
  const sizeBytes = bytes.byteLength;
  if (sizeBytes <= 0) {
    throw new ImageProbeError("file is empty");
  }
  if (sizeBytes > OPERATOR_IMAGE_LIMITS.maxFileSizeBytes) {
    throw new ImageProbeError(
      `file must be ≤ ${OPERATOR_IMAGE_LIMITS.maxFileSizeBytes} bytes (10 MB)`
    );
  }

  let dims;
  try {
    dims = readImageDimensions(bytes);
  } catch (err) {
    if (err instanceof ImageProbeError) throw err;
    throw new ImageProbeError("could not read image dimensions");
  }

  if (
    !(OPERATOR_IMAGE_LIMITS.allowedMimeTypes as readonly string[]).includes(
      dims.mimeType
    )
  ) {
    throw new ImageProbeError("only jpg, png and webp images are accepted");
  }

  if (contentType) {
    const declared = contentType.toLowerCase().split(";")[0]!.trim();
    const aliases: Record<string, string> = {
      "image/jpg": "image/jpeg",
      "image/pjpeg": "image/jpeg",
    };
    const normalised = aliases[declared] ?? declared;
    if (normalised && normalised !== dims.mimeType) {
      throw new ImageProbeError(
        `content type ${declared} does not match file contents (${dims.mimeType})`
      );
    }
  }

  const mins = OPERATOR_IMAGE_LIMITS[kind];
  if (dims.width < mins.minWidthPx || dims.height < mins.minHeightPx) {
    throw new ImageProbeError(
      `image must be at least ${mins.minWidthPx}×${mins.minHeightPx} px (got ${dims.width}×${dims.height})`
    );
  }

  return {
    mime: dims.mimeType,
    width: dims.width,
    height: dims.height,
    sizeBytes,
  };
}

export async function uploadOperatorProfileImage(
  store: DealDraftStore,
  operatorId: string,
  kind: OperatorImageKind,
  file: {
    filename: string;
    bytes: Uint8Array;
    contentType?: string | null;
  },
  options?: { now?: string; storage?: MediaStorage }
): Promise<Operator> {
  requireOperator(store, operatorId);

  let probed;
  try {
    probed = validateOperatorImageBytes(file.bytes, kind, file.contentType);
  } catch (err) {
    if (err instanceof ImageProbeError) {
      throw new OperatorValidationError([
        { field: kind, message: err.message },
      ]);
    }
    throw err;
  }

  const storage = options?.storage ?? getMediaStorage();
  const fileId = crypto.randomUUID();
  const ext = extensionForMime(probed.mime);
  const key = buildOperatorImageKey(operatorId, kind, fileId, ext);
  const stored = await storage.put(key, file.bytes, probed.mime);

  const field = kind === "logo" ? "logo" : "cover_image";
  return updateOperatorProfile(
    store,
    operatorId,
    { [field]: stored.url },
    { now: options?.now }
  );
}

// ---------------------------------------------------------------------------
// UI option helpers (re-exported for screens)
// ---------------------------------------------------------------------------

export function profileRegionOptions(): readonly string[] {
  return PLATFORM_REGIONS;
}

export function isProfileRegion(value: unknown): boolean {
  return isPlatformRegion(value);
}

/** Lightweight checks exposed for client mirrors / tests. */
export const PROFILE_FIELD_CHECKS = {
  isHttpsUrl,
  isE164Phone,
  isValidBookingEmail,
  isValidIanaTimezone,
  isIso4217Currency,
  isIso6391: (v: string) => ISO_639_1_REGEX.test(v),
} as const;
