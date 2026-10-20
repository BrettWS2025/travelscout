/**
 * Manual sessions and price-options API (deals platform Chunk 13).
 *
 * Works against the in-memory DealDraftStore from Chunk 12.
 * Live-deal edits re-run publish validation (stub until Chunk 16) and require
 * `confirm: true` to persist.
 *
 * Routes: /api/marketplace/operator-deals/:id/sessions|price-options
 */

import { listDealEvents, type DealEvent } from "./deal-audit";
import {
  DealDraftError,
  type DealDraftStore,
} from "./deal-draft";
import type { Deal } from "./deal";
import {
  computeSeatsDisplayed,
  validateDealPriceOptionFields,
  validateDealSessionFields,
  withSeatsDisplayed,
  type DealPriceOption,
  type DealSession,
} from "./deal-session";
import {
  DealNotFoundError,
  logDealEvent,
  stubValidateForPublish,
  type DealActor,
  type PublishValidationResult,
  type ValidateForPublishFn,
} from "./deal-status";
import {
  isManualDealType,
  isPriceOptionType,
  type PriceOptionType,
} from "./enums";
import {
  discountPct,
  maxDealPrice,
  meetsMinDiscount,
  meetsMinDiscountPercentage,
  priceFromPercentage,
  withDiscountPct,
} from "./pricing";
import {
  endOfLocalDayWindowUtc,
  getZonedParts,
  localDateKey,
  startOfLocalDayUtc,
  zonedLocalToUtcIso,
} from "./timezone";
import { getPlatformConfig } from "./config";

// ---------------------------------------------------------------------------
// Constants / errors
// ---------------------------------------------------------------------------

/** Max open-window day rows per manual_open_window deal. */
export const MAX_OPEN_WINDOW_DAYS = 3;

export class LiveDealConfirmRequiredError extends DealDraftError {
  readonly validation: PublishValidationResult;
  readonly warnings: string[];

  constructor(
    message: string,
    validation: PublishValidationResult,
    warnings: string[]
  ) {
    super(message, 409);
    this.name = "LiveDealConfirmRequiredError";
    this.validation = validation;
    this.warnings = warnings;
  }
}

export class MinDiscountError extends DealDraftError {
  readonly maxDealPriceMinor: number;

  constructor(originalMinor: number, maxAllowed: number) {
    const { MIN_DISCOUNT_PCT } = getPlatformConfig();
    super(
      `Deal price must be ≤ ${maxAllowed} minor units (maximum allowed for ${MIN_DISCOUNT_PCT}% off an original of ${originalMinor}).`,
      400,
      [
        {
          field: "deal_price_minor",
          message: `must be ≤ ${maxAllowed} (max deal price for min ${MIN_DISCOUNT_PCT}% discount)`,
        },
      ]
    );
    this.name = "MinDiscountError";
    this.maxDealPriceMinor = maxAllowed;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export type InventoryMutationOptions = {
  actor: DealActor;
  now?: string;
  /** Required to persist when the deal is live. */
  confirm?: boolean;
  validateForPublish?: ValidateForPublishFn;
  id?: string;
};

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

function requireManualDeal(deal: Deal): void {
  if (!isManualDealType(deal.dealType)) {
    throw new DealDraftError(
      "Sessions and price options for integrated deals are not managed via this API",
      400,
      [{ field: "deal_type", message: "must be a manual deal type" }]
    );
  }
}

function operatorTimezone(store: DealDraftStore, deal: Deal): string {
  const op = store.operators.operators.get(deal.operatorId);
  return op?.timezone ?? getPlatformConfig().DEFAULT_TIMEZONE;
}

function sessionsForDeal(store: DealDraftStore, dealId: string): DealSession[] {
  return [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function priceOptionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealPriceOption[] {
  return [...store.priceOptions.values()]
    .filter((p) => p.dealId === dealId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * When the deal is live and confirm is not true, run publish validation and
 * throw LiveDealConfirmRequiredError so the client can show warnings and resend.
 * Awaits ValidateForPublishFn (sync or async), matching clearAutoPause.
 */
export async function assertLiveConfirmOrThrow(
  deal: Deal,
  options: InventoryMutationOptions
): Promise<PublishValidationResult> {
  const validate = options.validateForPublish ?? stubValidateForPublish;
  const validation = await validate(deal);
  if (deal.status !== "live") return validation;

  if (options.confirm === true) return validation;

  const warnings: string[] = [
    "This deal is live. Resend with confirm: true to apply the change.",
  ];
  for (const check of validation.checks) {
    if (!check.passed) {
      warnings.push(check.message ?? `${check.label} failed`);
    }
  }
  throw new LiveDealConfirmRequiredError(
    "Live deal changes require confirm: true",
    validation,
    warnings
  );
}

function parseOptionalInt(
  value: unknown,
  field: string
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  throw new DealDraftError(`${field} must be an integer`, 400, [
    { field, message: "must be an integer" },
  ]);
}

function asHttpsUrlOrNull(
  value: unknown,
  field: string
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new DealDraftError(`${field} must be a string URL`, 400, [
      { field, message: "must be a string" },
    ]);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DealDraftError(`${field} must be a valid https URL`, 400, [
      { field, message: "must be a valid https URL" },
    ]);
  }
  if (url.protocol !== "https:") {
    throw new DealDraftError(`${field} must use https`, 400, [
      { field, message: "must be https" },
    ]);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Sessions — create
// ---------------------------------------------------------------------------

export type CreateSessionInput = {
  /** ISO UTC datetime (manual_session) or ignored when `date` is set. */
  startAt?: string | null;
  endAt?: string | null;
  manualSeatsAvailable?: number | null;
  seatCap?: number | null;
  /**
   * Open-window local calendar day YYYY-MM-DD in operator timezone.
   * When set (or deal is manual_open_window), builds start/end from window.
   */
  date?: string | null;
  /** Local start time HH:MM (default 00:00) for open window. */
  windowStart?: string | null;
  /** Local end time HH:MM (default 23:59) for open window. */
  windowEnd?: string | null;
};

export type SessionMutationResult = {
  session: DealSession;
  validation: PublishValidationResult;
};

/**
 * Add a session (manual_session) or day row (manual_open_window).
 * Recomputes seats_displayed; logs session_added.
 */
export async function createDealSession(
  store: DealDraftStore,
  dealId: string,
  raw: CreateSessionInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<SessionMutationResult> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const input = normalizeSessionInput(raw);
  const now = options.now ?? new Date().toISOString();
  const tz = operatorTimezone(store, deal);

  let startAt: string;
  let endAt: string | null;

  if (deal.dealType === "manual_open_window") {
    const built = buildOpenWindowBounds(store, deal, input, tz, now);
    startAt = built.startAt;
    endAt = built.endAt;
  } else {
    // manual_session
    if (!input.startAt) {
      throw new DealDraftError("start_at is required", 400, [
        { field: "start_at", message: "required" },
      ]);
    }
    if (Number.isNaN(Date.parse(input.startAt))) {
      throw new DealDraftError("start_at must be a valid datetime", 400, [
        { field: "start_at", message: "invalid datetime" },
      ]);
    }
    if (Date.parse(input.startAt) <= Date.parse(now)) {
      throw new DealDraftError("start_at must be in the future", 400, [
        { field: "start_at", message: "must be in the future" },
      ]);
    }
    startAt = new Date(input.startAt).toISOString();
    endAt =
      input.endAt != null && input.endAt !== ""
        ? new Date(input.endAt).toISOString()
        : null;
    if (endAt != null && Number.isNaN(Date.parse(endAt))) {
      throw new DealDraftError("end_at must be a valid datetime", 400, [
        { field: "end_at", message: "invalid datetime" },
      ]);
    }
  }

  const manualSeats =
    input.manualSeatsAvailable === undefined
      ? 0
      : input.manualSeatsAvailable;
  if (manualSeats === null) {
    throw new DealDraftError("manual_seats_available is required", 400, [
      { field: "manual_seats_available", message: "required" },
    ]);
  }

  const fieldErrors = validateDealSessionFields({
    startAt,
    endAt,
    manualSeatsAvailable: manualSeats,
    seatCap: input.seatCap ?? null,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid session fields", 400, fieldErrors);
  }

  const id = options.id ?? crypto.randomUUID();
  const withSeats = withSeatsDisplayed(
    {
      providerSeatsAvailable: null,
      manualSeatsAvailable: manualSeats,
      seatCap: input.seatCap ?? null,
    },
    deal
  );

  const session: DealSession = {
    id,
    dealId,
    externalSessionId: null,
    startAt,
    endAt,
    providerSeatsAvailable: null,
    manualSeatsAvailable: manualSeats,
    seatCap: input.seatCap ?? null,
    seatsDisplayed: withSeats.seatsDisplayed,
    status: "live",
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  store.sessions.set(id, session);
  logDealEvent(
    store.audit,
    dealId,
    "session_added",
    options.actor,
    {
      session_id: id,
      start_at: startAt,
      end_at: endAt,
      manual_seats_available: manualSeats,
      seats_displayed: session.seatsDisplayed,
    },
    { now }
  );

  return { session, validation };
}

function normalizeSessionInput(
  raw: CreateSessionInput | Record<string, unknown>
): CreateSessionInput {
  const r = raw as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined) return r[k];
    }
    return undefined;
  };

  let manualSeatsAvailable: number | null | undefined;
  try {
    manualSeatsAvailable = parseOptionalInt(
      get("manualSeatsAvailable", "manual_seats_available"),
      "manual_seats_available"
    );
  } catch (err) {
    throw err;
  }

  let seatCap: number | null | undefined;
  try {
    seatCap = parseOptionalInt(get("seatCap", "seat_cap"), "seat_cap");
  } catch (err) {
    throw err;
  }

  const startRaw = get("startAt", "start_at");
  const endRaw = get("endAt", "end_at");
  const dateRaw = get("date");
  const windowStart = get("windowStart", "window_start");
  const windowEnd = get("windowEnd", "window_end");

  return {
    startAt:
      startRaw === undefined
        ? undefined
        : startRaw === null
          ? null
          : String(startRaw),
    endAt:
      endRaw === undefined
        ? undefined
        : endRaw === null
          ? null
          : String(endRaw),
    date:
      dateRaw === undefined
        ? undefined
        : dateRaw === null
          ? null
          : String(dateRaw),
    windowStart:
      windowStart === undefined || windowStart === null
        ? undefined
        : String(windowStart),
    windowEnd:
      windowEnd === undefined || windowEnd === null
        ? undefined
        : String(windowEnd),
    manualSeatsAvailable,
    seatCap,
  };
}

function buildOpenWindowBounds(
  store: DealDraftStore,
  deal: Deal,
  input: CreateSessionInput,
  timeZone: string,
  now: string
): { startAt: string; endAt: string } {
  const existing = sessionsForDeal(store, deal.id);

  let date = input.date ?? null;
  if (!date && input.startAt) {
    // Allow clients to send start_at; derive the local day key.
    date = localDateKey(input.startAt, timeZone);
  }
  if (!date) {
    throw new DealDraftError(
      "date is required for manual_open_window (YYYY-MM-DD in operator timezone)",
      400,
      [{ field: "date", message: "required" }]
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DealDraftError("date must be YYYY-MM-DD", 400, [
      { field: "date", message: "must be YYYY-MM-DD" },
    ]);
  }

  for (const s of existing) {
    if (localDateKey(s.startAt, timeZone) === date) {
      throw new DealDraftError(
        `A session already exists for ${date} (no duplicate days)`,
        400,
        [{ field: "date", message: "duplicate day" }]
      );
    }
  }

  if (existing.length >= MAX_OPEN_WINDOW_DAYS) {
    throw new DealDraftError(
      `manual_open_window allows at most ${MAX_OPEN_WINDOW_DAYS} days`,
      400,
      [
        {
          field: "date",
          message: `max ${MAX_OPEN_WINDOW_DAYS} days per open-window deal`,
        },
      ]
    );
  }

  const windowStart = input.windowStart?.trim() || "00:00";
  const windowEnd = input.windowEnd?.trim() || "23:59";

  let startAt: string;
  let endAt: string;
  try {
    startAt = input.windowStart
      ? zonedLocalToUtcIso(date, windowStart, timeZone)
      : startOfLocalDayUtc(date, timeZone);
    endAt = input.windowEnd
      ? zonedLocalToUtcIso(date, windowEnd, timeZone)
      : endOfLocalDayWindowUtc(date, timeZone);
  } catch (err) {
    throw new DealDraftError(
      err instanceof Error ? err.message : "Invalid open-window time",
      400,
      [{ field: "date", message: "invalid local date/time" }]
    );
  }

  if (Date.parse(startAt) <= Date.parse(now)) {
    throw new DealDraftError(
      "open-window day start must be in the future",
      400,
      [{ field: "date", message: "must be in the future" }]
    );
  }
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    throw new DealDraftError("window_end must be after window_start", 400, [
      { field: "window_end", message: "must be after window_start" },
    ]);
  }

  return { startAt, endAt };
}

// ---------------------------------------------------------------------------
// Sessions — update / delete
// ---------------------------------------------------------------------------

export type UpdateSessionInput = CreateSessionInput;

export async function updateDealSession(
  store: DealDraftStore,
  dealId: string,
  sessionId: string,
  raw: UpdateSessionInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<SessionMutationResult> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const existing = store.sessions.get(sessionId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Session not found", 404);
  }

  const input = normalizeSessionInput(raw);
  const now = options.now ?? new Date().toISOString();
  const tz = operatorTimezone(store, deal);
  const beforeSeats = existing.manualSeatsAvailable;

  let startAt = existing.startAt;
  let endAt = existing.endAt;

  if (deal.dealType === "manual_open_window") {
    const dateChanging =
      input.date != null ||
      input.windowStart != null ||
      input.windowEnd != null ||
      input.startAt != null;

    if (dateChanging) {
      // Rebuild day bounds; enforce uniqueness excluding this session.
      const date =
        input.date ??
        (input.startAt
          ? localDateKey(input.startAt, tz)
          : localDateKey(existing.startAt, tz));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new DealDraftError("date must be YYYY-MM-DD", 400, [
          { field: "date", message: "must be YYYY-MM-DD" },
        ]);
      }
      for (const s of sessionsForDeal(store, dealId)) {
        if (s.id === sessionId) continue;
        if (localDateKey(s.startAt, tz) === date) {
          throw new DealDraftError(
            `A session already exists for ${date} (no duplicate days)`,
            400,
            [{ field: "date", message: "duplicate day" }]
          );
        }
      }
      // Prefer explicit window times; else keep prior local times from existing.
      const existingStartParts = getZonedParts(existing.startAt, tz);
      const existingEndParts = existing.endAt
        ? getZonedParts(existing.endAt, tz)
        : null;

      const startTime =
        input.windowStart?.trim() ||
        `${String(existingStartParts.hour).padStart(2, "0")}:${String(existingStartParts.minute).padStart(2, "0")}`;
      const endTime =
        input.windowEnd?.trim() ||
        (existingEndParts
          ? `${String(existingEndParts.hour).padStart(2, "0")}:${String(existingEndParts.minute).padStart(2, "0")}`
          : "23:59");

      try {
        startAt = zonedLocalToUtcIso(date, startTime, tz);
        endAt = zonedLocalToUtcIso(date, endTime, tz);
      } catch (err) {
        throw new DealDraftError(
          err instanceof Error ? err.message : "Invalid open-window time",
          400,
          [{ field: "date", message: "invalid local date/time" }]
        );
      }
    }
  } else {
    if (input.startAt !== undefined && input.startAt != null) {
      if (Number.isNaN(Date.parse(input.startAt))) {
        throw new DealDraftError("start_at must be a valid datetime", 400, [
          { field: "start_at", message: "invalid datetime" },
        ]);
      }
      if (Date.parse(input.startAt) <= Date.parse(now)) {
        throw new DealDraftError("start_at must be in the future", 400, [
          { field: "start_at", message: "must be in the future" },
        ]);
      }
      startAt = new Date(input.startAt).toISOString();
    }
    if (input.endAt !== undefined) {
      endAt =
        input.endAt == null || input.endAt === ""
          ? null
          : new Date(input.endAt).toISOString();
    }
  }

  const manualSeats =
    input.manualSeatsAvailable !== undefined
      ? input.manualSeatsAvailable
      : existing.manualSeatsAvailable;
  if (manualSeats == null) {
    throw new DealDraftError("manual_seats_available is required", 400, [
      { field: "manual_seats_available", message: "required" },
    ]);
  }

  const seatCap =
    input.seatCap !== undefined ? input.seatCap : existing.seatCap;

  const fieldErrors = validateDealSessionFields({
    startAt,
    endAt,
    manualSeatsAvailable: manualSeats,
    seatCap,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid session fields", 400, fieldErrors);
  }

  const seatsDisplayed = computeSeatsDisplayed(
    {
      providerSeatsAvailable: null,
      manualSeatsAvailable: manualSeats,
      seatCap,
    },
    deal
  );

  const updated: DealSession = {
    ...existing,
    startAt,
    endAt,
    manualSeatsAvailable: manualSeats,
    seatCap,
    seatsDisplayed,
    updatedAt: now,
  };
  store.sessions.set(sessionId, updated);

  if (beforeSeats !== manualSeats) {
    logDealEvent(
      store.audit,
      dealId,
      "seats_changed",
      options.actor,
      {
        session_id: sessionId,
        old_manual_seats_available: beforeSeats,
        new_manual_seats_available: manualSeats,
        seats_displayed: seatsDisplayed,
      },
      { now }
    );
  } else {
    logDealEvent(
      store.audit,
      dealId,
      "updated",
      options.actor,
      {
        session_id: sessionId,
        fields: ["session"],
      },
      { now }
    );
  }

  return { session: updated, validation };
}

export async function deleteDealSession(
  store: DealDraftStore,
  dealId: string,
  sessionId: string,
  options: InventoryMutationOptions
): Promise<{ validation: PublishValidationResult }> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const existing = store.sessions.get(sessionId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Session not found", 404);
  }

  const now = options.now ?? new Date().toISOString();
  store.sessions.delete(sessionId);
  logDealEvent(
    store.audit,
    dealId,
    "session_removed",
    options.actor,
    {
      session_id: sessionId,
      start_at: existing.startAt,
    },
    { now }
  );

  return { validation };
}

// ---------------------------------------------------------------------------
// Price options — create / update / delete / reorder
// ---------------------------------------------------------------------------

export type CreatePriceOptionInput = {
  label?: string | null;
  type?: PriceOptionType | string | null;
  originalPriceMinor?: number | null;
  dealPriceMinor?: number | null;
  /** When set (or discount_input_mode is percentage), compute deal_price_minor. */
  percentage?: number | null;
  originalPriceEvidenceUrl?: string | null;
  sortOrder?: number | null;
};

export type PriceOptionMutationResult = {
  priceOption: DealPriceOption;
  validation: PublishValidationResult;
};

function normalizePriceOptionInput(
  raw: CreatePriceOptionInput | Record<string, unknown>
): CreatePriceOptionInput {
  const r = raw as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined) return r[k];
    }
    return undefined;
  };

  const labelRaw = get("label");
  const typeRaw = get("type");
  const percentageRaw = get("percentage", "discount_pct_input", "pct");

  return {
    label:
      labelRaw === undefined
        ? undefined
        : labelRaw === null
          ? null
          : String(labelRaw),
    type:
      typeRaw === undefined
        ? undefined
        : typeRaw === null
          ? null
          : (String(typeRaw) as PriceOptionType),
    originalPriceMinor: parseOptionalInt(
      get("originalPriceMinor", "original_price_minor"),
      "original_price_minor"
    ),
    dealPriceMinor: parseOptionalInt(
      get("dealPriceMinor", "deal_price_minor"),
      "deal_price_minor"
    ),
    percentage:
      percentageRaw === undefined
        ? undefined
        : percentageRaw === null
          ? null
          : typeof percentageRaw === "number"
            ? percentageRaw
            : Number(percentageRaw),
    originalPriceEvidenceUrl: asHttpsUrlOrNull(
      get("originalPriceEvidenceUrl", "original_price_evidence_url"),
      "original_price_evidence_url"
    ) as string | null | undefined,
    sortOrder: parseOptionalInt(get("sortOrder", "sort_order"), "sort_order"),
  };
}

/**
 * Resolve deal_price_minor from either an explicit price or a percentage,
 * honouring the deal's discount_input_mode when only one side is ambiguous.
 */
export function resolveDealPriceMinor(args: {
  originalPriceMinor: number;
  dealPriceMinor?: number | null;
  percentage?: number | null;
  discountInputMode: Deal["discountInputMode"];
}): { dealPriceMinor: number; fromPercentage: boolean } {
  const { originalPriceMinor, discountInputMode } = args;
  const hasPct = args.percentage != null && Number.isFinite(args.percentage);
  const hasPrice =
    args.dealPriceMinor != null && Number.isInteger(args.dealPriceMinor);

  if (hasPct && (!hasPrice || discountInputMode === "percentage")) {
    const pct = args.percentage as number;
    if (!meetsMinDiscountPercentage(pct)) {
      const { MIN_DISCOUNT_PCT } = getPlatformConfig();
      throw new DealDraftError(
        `percentage must be ≥ ${MIN_DISCOUNT_PCT}`,
        400,
        [
          {
            field: "percentage",
            message: `must be ≥ ${MIN_DISCOUNT_PCT}`,
          },
        ]
      );
    }
    return {
      dealPriceMinor: priceFromPercentage(originalPriceMinor, pct),
      fromPercentage: true,
    };
  }

  if (hasPrice) {
    return {
      dealPriceMinor: args.dealPriceMinor as number,
      fromPercentage: false,
    };
  }

  throw new DealDraftError(
    discountInputMode === "percentage"
      ? "percentage is required"
      : "deal_price_minor is required",
    400,
    [
      {
        field:
          discountInputMode === "percentage" ? "percentage" : "deal_price_minor",
        message: "required",
      },
    ]
  );
}

function assertMinDiscount(originalMinor: number, dealMinor: number): void {
  if (!meetsMinDiscount(originalMinor, dealMinor)) {
    throw new MinDiscountError(originalMinor, maxDealPrice(originalMinor));
  }
}

export async function createDealPriceOption(
  store: DealDraftStore,
  dealId: string,
  raw: CreatePriceOptionInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<PriceOptionMutationResult> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const input = normalizePriceOptionInput(raw);
  const now = options.now ?? new Date().toISOString();

  if (!input.label || input.label.trim() === "") {
    throw new DealDraftError("label is required", 400, [
      { field: "label", message: "required" },
    ]);
  }
  if (!input.type || !isPriceOptionType(input.type)) {
    throw new DealDraftError("type is required and must be a price_option_type", 400, [
      { field: "type", message: "invalid or missing" },
    ]);
  }
  if (
    input.originalPriceMinor == null ||
    !Number.isInteger(input.originalPriceMinor)
  ) {
    throw new DealDraftError("original_price_minor is required", 400, [
      { field: "original_price_minor", message: "required" },
    ]);
  }

  const { dealPriceMinor } = resolveDealPriceMinor({
    originalPriceMinor: input.originalPriceMinor,
    dealPriceMinor: input.dealPriceMinor,
    percentage: input.percentage,
    discountInputMode: deal.discountInputMode,
  });

  assertMinDiscount(input.originalPriceMinor, dealPriceMinor);

  const fieldErrors = validateDealPriceOptionFields({
    label: input.label,
    type: input.type,
    originalPriceMinor: input.originalPriceMinor,
    dealPriceMinor,
    originalPriceSource: "operator_entered",
    sortOrder: input.sortOrder ?? 0,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid price option fields", 400, fieldErrors);
  }

  const existing = priceOptionsForDeal(store, dealId);
  const sortOrder =
    input.sortOrder != null
      ? input.sortOrder
      : existing.length === 0
        ? 0
        : Math.max(...existing.map((o) => o.sortOrder)) + 1;

  const id = options.id ?? crypto.randomUUID();
  const base = {
    originalPriceMinor: input.originalPriceMinor,
    dealPriceMinor,
  };
  const withPct = withDiscountPct(base);

  const option: DealPriceOption = {
    id,
    dealId,
    label: input.label.trim(),
    type: input.type,
    externalPriceOptionId: null,
    externalDealPriceOptionId: null,
    originalPriceMinor: input.originalPriceMinor,
    originalPriceSource: "operator_entered",
    originalPriceEvidenceUrl: input.originalPriceEvidenceUrl ?? null,
    dealPriceMinor,
    discountPct: withPct.discountPct,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  store.priceOptions.set(id, option);
  logDealEvent(
    store.audit,
    dealId,
    "price_changed",
    options.actor,
    {
      price_option_id: id,
      old: null,
      new: {
        original_price_minor: option.originalPriceMinor,
        deal_price_minor: option.dealPriceMinor,
        discount_pct: option.discountPct,
      },
    },
    { now }
  );

  return { priceOption: option, validation };
}

export async function updateDealPriceOption(
  store: DealDraftStore,
  dealId: string,
  optionId: string,
  raw: CreatePriceOptionInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<PriceOptionMutationResult> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const existing = store.priceOptions.get(optionId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Price option not found", 404);
  }

  const input = normalizePriceOptionInput(raw);
  const now = options.now ?? new Date().toISOString();

  const label =
    input.label !== undefined
      ? input.label == null
        ? existing.label
        : input.label.trim()
      : existing.label;
  if (!label) {
    throw new DealDraftError("label is required", 400, [
      { field: "label", message: "required" },
    ]);
  }

  let type = existing.type;
  if (input.type !== undefined && input.type != null) {
    if (!isPriceOptionType(input.type)) {
      throw new DealDraftError("type is invalid", 400, [
        { field: "type", message: "invalid" },
      ]);
    }
    type = input.type;
  }

  const originalPriceMinor =
    input.originalPriceMinor !== undefined && input.originalPriceMinor != null
      ? input.originalPriceMinor
      : existing.originalPriceMinor;

  const priceChanging =
    input.dealPriceMinor !== undefined ||
    input.percentage !== undefined ||
    (input.originalPriceMinor !== undefined &&
      input.originalPriceMinor !== existing.originalPriceMinor);

  let dealPriceMinor = existing.dealPriceMinor;
  if (priceChanging) {
    const resolved = resolveDealPriceMinor({
      originalPriceMinor,
      dealPriceMinor:
        input.dealPriceMinor !== undefined
          ? input.dealPriceMinor
          : input.percentage != null
            ? undefined
            : existing.dealPriceMinor,
      percentage: input.percentage,
      discountInputMode: deal.discountInputMode,
    });
    dealPriceMinor = resolved.dealPriceMinor;
  }

  assertMinDiscount(originalPriceMinor, dealPriceMinor);

  const evidenceUrl =
    input.originalPriceEvidenceUrl !== undefined
      ? input.originalPriceEvidenceUrl
      : existing.originalPriceEvidenceUrl;

  const sortOrder =
    input.sortOrder !== undefined && input.sortOrder != null
      ? input.sortOrder
      : existing.sortOrder;

  const fieldErrors = validateDealPriceOptionFields({
    label,
    type,
    originalPriceMinor,
    dealPriceMinor,
    originalPriceSource: "operator_entered",
    sortOrder,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid price option fields", 400, fieldErrors);
  }

  const withPct = withDiscountPct({ originalPriceMinor, dealPriceMinor });
  const updated: DealPriceOption = {
    ...existing,
    label,
    type,
    originalPriceMinor,
    originalPriceSource: "operator_entered",
    originalPriceEvidenceUrl: evidenceUrl,
    dealPriceMinor,
    discountPct: withPct.discountPct,
    sortOrder,
    updatedAt: now,
  };

  store.priceOptions.set(optionId, updated);

  const oldSnapshot = {
    original_price_minor: existing.originalPriceMinor,
    deal_price_minor: existing.dealPriceMinor,
    discount_pct: existing.discountPct,
  };
  const newSnapshot = {
    original_price_minor: updated.originalPriceMinor,
    deal_price_minor: updated.dealPriceMinor,
    discount_pct: updated.discountPct,
  };
  if (JSON.stringify(oldSnapshot) !== JSON.stringify(newSnapshot)) {
    logDealEvent(
      store.audit,
      dealId,
      "price_changed",
      options.actor,
      {
        price_option_id: optionId,
        old: oldSnapshot,
        new: newSnapshot,
      },
      { now }
    );
  }

  return { priceOption: updated, validation };
}

export async function deleteDealPriceOption(
  store: DealDraftStore,
  dealId: string,
  optionId: string,
  options: InventoryMutationOptions
): Promise<{ validation: PublishValidationResult }> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  const existing = store.priceOptions.get(optionId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Price option not found", 404);
  }

  const now = options.now ?? new Date().toISOString();

  // Remove dependent discount steps.
  for (const [stid, step] of store.discountSteps) {
    if (step.priceOptionId === optionId) store.discountSteps.delete(stid);
  }

  store.priceOptions.delete(optionId);
  logDealEvent(
    store.audit,
    dealId,
    "price_changed",
    options.actor,
    {
      price_option_id: optionId,
      old: {
        original_price_minor: existing.originalPriceMinor,
        deal_price_minor: existing.dealPriceMinor,
        discount_pct: existing.discountPct,
      },
      new: null,
    },
    { now }
  );

  return { validation };
}

export type ReorderPriceOptionsResult = {
  priceOptions: DealPriceOption[];
  validation: PublishValidationResult;
};

/**
 * Set sort_order from an ordered list of price option ids.
 * Body: { ordered_ids: string[] } (all options for the deal, or a subset).
 */
export async function reorderDealPriceOptions(
  store: DealDraftStore,
  dealId: string,
  orderedIds: string[],
  options: InventoryMutationOptions
): Promise<ReorderPriceOptionsResult> {
  const deal = requireDeal(store, dealId);
  requireManualDeal(deal);
  const validation = await assertLiveConfirmOrThrow(deal, options);

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new DealDraftError("ordered_ids is required", 400, [
      { field: "ordered_ids", message: "required non-empty array" },
    ]);
  }

  const existing = priceOptionsForDeal(store, dealId);
  const byId = new Map(existing.map((o) => [o.id, o]));
  for (const id of orderedIds) {
    if (!byId.has(id)) {
      throw new DealDraftError(`Unknown price option id: ${id}`, 400, [
        { field: "ordered_ids", message: `unknown id ${id}` },
      ]);
    }
  }

  const now = options.now ?? new Date().toISOString();
  const seen = new Set<string>();
  let order = 0;
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const opt = byId.get(id)!;
    const updated = { ...opt, sortOrder: order, updatedAt: now };
    store.priceOptions.set(id, updated);
    order += 1;
  }
  // Append any options not listed, keeping relative order after the listed ones.
  for (const opt of existing) {
    if (seen.has(opt.id)) continue;
    const updated = { ...opt, sortOrder: order, updatedAt: now };
    store.priceOptions.set(opt.id, updated);
    order += 1;
  }

  return {
    priceOptions: priceOptionsForDeal(store, dealId),
    validation,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function listSessionEvents(
  store: DealDraftStore,
  dealId: string
): DealEvent[] {
  return listDealEvents(store.audit, dealId).filter((e) =>
    ["session_added", "session_removed", "seats_changed"].includes(e.eventType)
  );
}

export function listPriceChangeEvents(
  store: DealDraftStore,
  dealId: string
): DealEvent[] {
  return listDealEvents(store.audit, dealId).filter(
    (e) => e.eventType === "price_changed"
  );
}

/** Re-export for callers that need the computed discount after a save. */
export { discountPct, maxDealPrice };
