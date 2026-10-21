/**
 * Integrated availability and capacity (Chunk 34).
 *
 * - GET available-sessions → ExternalSessions in the next MAX_LEAD_HOURS
 * - Select sessions → DealSessions linked via external_session_id
 * - capacity_mode: live_provider | live_provider_capped (+ per-session seat_cap)
 * - seats_displayed recomputed on select and on every sync (integration-sync)
 */

import { getPlatformConfig } from "./config";
import type { Deal } from "./deal";
import { DealDraftError, type DealDraftStore } from "./deal-draft";
import {
  CAPACITY_CAP_NOTE,
} from "./deal-integrated-availability-shared";
import { createValidateForPublishFromStore } from "./deal-publish-validation";
import {
  validateDealSessionFields,
  withSeatsDisplayed,
  type DealSession,
} from "./deal-session";
import {
  DealNotFoundError,
  logDealEvent,
  type DealActor,
  type PublishValidationResult,
  type ValidateForPublishFn,
} from "./deal-status";
import type { ExternalSession } from "./integration";
import {
  isIntegratedDealType,
  type CapacityMode,
  type SessionStatus,
} from "./enums";

export { CAPACITY_CAP_NOTE };

// ---------------------------------------------------------------------------
// Options / errors
// ---------------------------------------------------------------------------

export type IntegratedAvailabilityMutationOptions = {
  actor: DealActor;
  now?: string;
  confirm?: boolean;
  validateForPublish?: ValidateForPublishFn;
};

class LiveDealConfirmRequiredError extends DealDraftError {
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

async function assertLiveConfirmOrThrow(
  store: DealDraftStore,
  deal: Deal,
  options: IntegratedAvailabilityMutationOptions
): Promise<PublishValidationResult> {
  const validate =
    options.validateForPublish ??
    createValidateForPublishFromStore(store, {
      now: options.now,
      refreshStaleLinks: false,
    });
  const validation = await Promise.resolve(validate(deal));
  if (deal.status !== "live" || options.confirm === true) {
    return validation;
  }
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AvailableExternalSession = {
  id: string;
  external_id: string;
  start_at: string;
  end_at: string | null;
  seats_available: number | null;
  status: SessionStatus;
  last_synced_at: string | null;
  /** True when this ExternalSession is already linked on the deal. */
  selected: boolean;
  /** DealSession id when selected. */
  deal_session_id: string | null;
  /** Per-session seat_cap override when selected. */
  seat_cap: number | null;
  seats_displayed: number | null;
};

export type ListAvailableSessionsResult = {
  sessions: AvailableExternalSession[];
  capacity_mode: CapacityMode | null;
  seat_cap: number | null;
  note: string;
  max_lead_hours: number;
};

export type SelectIntegratedSessionsInput = {
  /** ExternalSession UUID ids (store keys), not provider external_id strings. */
  external_session_ids: string[];
  capacity_mode?: "live_provider" | "live_provider_capped";
  seat_cap?: number | null;
  /** Per ExternalSession id → seat_cap override (null clears). */
  session_seat_caps?: Record<string, number | null>;
};

export type SelectIntegratedSessionsResult = {
  deal: Deal;
  sessions: DealSession[];
  validation: PublishValidationResult;
  note: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

function requireIntegratedDeal(deal: Deal): void {
  if (!isIntegratedDealType(deal.dealType)) {
    throw new DealDraftError(
      "Integrated availability applies only to integrated deal types",
      400,
      [{ field: "deal_type", message: "must be an integrated deal type" }]
    );
  }
}

function leadWindowEnd(nowMs: number): number {
  const { MAX_LEAD_HOURS } = getPlatformConfig();
  return nowMs + MAX_LEAD_HOURS * 60 * 60 * 1000;
}

function sessionsForDeal(store: DealDraftStore, dealId: string): DealSession[] {
  return [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function externalSessionsForProduct(
  store: DealDraftStore,
  externalProductId: string
): ExternalSession[] {
  const map = store.externalSessions;
  if (!map) return [];
  return [...map.values()].filter(
    (s) => s.externalProductId === externalProductId
  );
}

function parseSeatCap(
  value: unknown,
  field: string
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    throw new DealDraftError(`${field} must be an integer 1–999`, 400, [
      { field, message: "must be an integer 1–999" },
    ]);
  }
  return n;
}

function sessionStatusFromExternal(
  ext: ExternalSession,
  seats: number
): SessionStatus {
  if (ext.status === "cancelled") return "cancelled";
  if (ext.status === "expired") return "expired";
  if (seats === 0 || ext.status === "sold_out") return "sold_out";
  return "live";
}

/**
 * Recompute seats_displayed on every DealSession for this deal (e.g. after
 * capacity_mode / seat_cap changes on the Deal row).
 */
export function recomputeDealSessionSeats(
  store: DealDraftStore,
  dealId: string,
  now?: string
): DealSession[] {
  const deal = requireDeal(store, dealId);
  const ts = now ?? new Date().toISOString();
  const updated: DealSession[] = [];
  for (const session of sessionsForDeal(store, dealId)) {
    const next = {
      ...session,
      ...withSeatsDisplayed(session, deal),
      updatedAt: ts,
    };
    store.sessions.set(session.id, next);
    updated.push(next);
  }
  return updated;
}

// ---------------------------------------------------------------------------
// List available sessions
// ---------------------------------------------------------------------------

/**
 * ExternalSessions for the deal's product starting within MAX_LEAD_HOURS,
 * with seats_available, status and last_synced_at. Marks which are selected.
 */
export function listAvailableSessionsForDeal(
  store: DealDraftStore,
  dealId: string,
  options?: { now?: string | Date }
): ListAvailableSessionsResult {
  const deal = requireDeal(store, dealId);
  requireIntegratedDeal(deal);

  const { MAX_LEAD_HOURS } = getPlatformConfig();
  const nowIso =
    options?.now instanceof Date
      ? options.now.toISOString()
      : options?.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const endMs = leadWindowEnd(nowMs);

  if (!deal.externalProductId) {
    throw new DealDraftError("Deal has no external_product_id", 400, [
      { field: "external_product_id", message: "required" },
    ]);
  }

  const dealSessions = sessionsForDeal(store, dealId);
  const byExtId = new Map(
    dealSessions
      .filter((s) => s.externalSessionId != null)
      .map((s) => [s.externalSessionId as string, s])
  );

  const sessions = externalSessionsForProduct(store, deal.externalProductId)
    .filter((s) => {
      const start = Date.parse(s.startAt);
      if (Number.isNaN(start)) return false;
      return start > nowMs && start <= endMs;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((s): AvailableExternalSession => {
      const linked = byExtId.get(s.id) ?? null;
      return {
        id: s.id,
        external_id: s.externalId,
        start_at: s.startAt,
        end_at: s.endAt,
        seats_available: s.seatsAvailable,
        status: s.status,
        last_synced_at: s.lastSyncedAt,
        selected: linked != null,
        deal_session_id: linked?.id ?? null,
        seat_cap: linked?.seatCap ?? null,
        seats_displayed: linked?.seatsDisplayed ?? null,
      };
    });

  return {
    sessions,
    capacity_mode: deal.capacityMode,
    seat_cap: deal.seatCap,
    note: CAPACITY_CAP_NOTE,
    max_lead_hours: MAX_LEAD_HOURS,
  };
}

// ---------------------------------------------------------------------------
// Select sessions (+ capacity)
// ---------------------------------------------------------------------------

/**
 * Replace the deal's selected provider sessions.
 * - integrated_session: exactly one external_session_id
 * - integrated_multi_session: one or more
 *
 * Each creates/updates a DealSession with external_session_id and
 * provider_seats_available from the ExternalSession. seats_displayed
 * recomputed via withSeatsDisplayed.
 */
export async function selectIntegratedSessions(
  store: DealDraftStore,
  dealId: string,
  raw: SelectIntegratedSessionsInput | Record<string, unknown>,
  options: IntegratedAvailabilityMutationOptions
): Promise<SelectIntegratedSessionsResult> {
  const deal = requireDeal(store, dealId);
  requireIntegratedDeal(deal);
  const validation = await assertLiveConfirmOrThrow(store, deal, options);

  if (!deal.externalProductId) {
    throw new DealDraftError("Deal has no external_product_id", 400, [
      { field: "external_product_id", message: "required" },
    ]);
  }

  const idsRaw = (raw as SelectIntegratedSessionsInput).external_session_ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    throw new DealDraftError(
      "external_session_ids must be a non-empty array",
      400,
      [{ field: "external_session_ids", message: "required" }]
    );
  }
  const externalSessionIds = idsRaw.map((id) => {
    if (typeof id !== "string" || id.trim() === "") {
      throw new DealDraftError(
        "external_session_ids must be non-empty strings",
        400,
        [{ field: "external_session_ids", message: "invalid id" }]
      );
    }
    return id.trim();
  });
  const uniqueIds = [...new Set(externalSessionIds)];
  if (uniqueIds.length !== externalSessionIds.length) {
    throw new DealDraftError(
      "external_session_ids must be unique",
      400,
      [{ field: "external_session_ids", message: "duplicate ids" }]
    );
  }

  if (deal.dealType === "integrated_session" && uniqueIds.length !== 1) {
    throw new DealDraftError(
      "integrated_session requires exactly one selected session",
      400,
      [
        {
          field: "external_session_ids",
          message: "exactly one session required",
        },
      ]
    );
  }

  const now = options.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const endMs = leadWindowEnd(nowMs);
  const extMap = store.externalSessions ?? new Map();

  const selectedExt: ExternalSession[] = [];
  for (const id of uniqueIds) {
    const ext = extMap.get(id);
    if (!ext || ext.externalProductId !== deal.externalProductId) {
      throw new DealDraftError(
        `External session ${id} not found for this product`,
        400,
        [{ field: "external_session_ids", message: `unknown session ${id}` }]
      );
    }
    const start = Date.parse(ext.startAt);
    if (Number.isNaN(start) || start <= nowMs || start > endMs) {
      throw new DealDraftError(
        `Session ${id} is outside the next ${getPlatformConfig().MAX_LEAD_HOURS} hours`,
        400,
        [
          {
            field: "external_session_ids",
            message: "must start within MAX_LEAD_HOURS",
          },
        ]
      );
    }
    if (ext.status === "cancelled") {
      throw new DealDraftError(`Session ${id} is cancelled`, 400, [
        { field: "external_session_ids", message: "session is cancelled" },
      ]);
    }
    selectedExt.push(ext);
  }

  // Capacity mode / deal seat_cap
  let nextDeal = deal;
  const capacityRaw = (raw as SelectIntegratedSessionsInput).capacity_mode;
  const seatCapRaw = (raw as SelectIntegratedSessionsInput).seat_cap;
  const sessionCapsRaw = (raw as SelectIntegratedSessionsInput)
    .session_seat_caps;

  if (capacityRaw !== undefined) {
    if (
      capacityRaw !== "live_provider" &&
      capacityRaw !== "live_provider_capped"
    ) {
      throw new DealDraftError(
        "capacity_mode must be live_provider or live_provider_capped",
        400,
        [{ field: "capacity_mode", message: "invalid value" }]
      );
    }
    nextDeal = { ...nextDeal, capacityMode: capacityRaw, updatedAt: now };
  }

  if (seatCapRaw !== undefined || capacityRaw !== undefined) {
    const mode = nextDeal.capacityMode;
    if (mode === "live_provider") {
      // Uncapped: clear deal seat_cap unless the client explicitly sets one
      // (display still uses session/deal cap via computeSeatsDisplayed when set).
      nextDeal = {
        ...nextDeal,
        seatCap:
          seatCapRaw === undefined
            ? null
            : parseSeatCap(seatCapRaw, "seat_cap") ?? null,
        updatedAt: now,
      };
    } else if (mode === "live_provider_capped") {
      const cap =
        seatCapRaw !== undefined
          ? parseSeatCap(seatCapRaw, "seat_cap")
          : nextDeal.seatCap;
      if (cap == null) {
        throw new DealDraftError(
          "seat_cap is required when capacity_mode is live_provider_capped",
          400,
          [{ field: "seat_cap", message: "required for live_provider_capped" }]
        );
      }
      nextDeal = { ...nextDeal, seatCap: cap, updatedAt: now };
    }
  }

  const sessionCapMap = new Map<string, number | null>();
  if (sessionCapsRaw != null && typeof sessionCapsRaw === "object") {
    for (const [extId, capVal] of Object.entries(sessionCapsRaw)) {
      sessionCapMap.set(extId, parseSeatCap(capVal, "session_seat_caps") ?? null);
    }
  }

  // Existing linked sessions by external_session_id
  const existingByExt = new Map<string, DealSession>();
  for (const s of sessionsForDeal(store, dealId)) {
    if (s.externalSessionId) existingByExt.set(s.externalSessionId, s);
  }

  const keepExtIds = new Set(uniqueIds);
  const removed: DealSession[] = [];
  for (const s of sessionsForDeal(store, dealId)) {
    if (
      s.externalSessionId == null ||
      !keepExtIds.has(s.externalSessionId)
    ) {
      store.sessions.delete(s.id);
      removed.push(s);
    }
  }

  const resultSessions: DealSession[] = [];
  const added: DealSession[] = [];
  for (const ext of selectedExt) {
    const seats =
      ext.status === "cancelled"
        ? 0
        : Math.max(0, ext.seatsAvailable ?? 0);
    const existing = existingByExt.get(ext.id);
    const seatCapOverride = sessionCapMap.has(ext.id)
      ? sessionCapMap.get(ext.id)!
      : existing?.seatCap ?? null;

    const fieldErrors = validateDealSessionFields({
      startAt: ext.startAt,
      endAt: ext.endAt,
      providerSeatsAvailable: seats,
      seatCap: seatCapOverride,
    });
    if (fieldErrors.length > 0) {
      throw new DealDraftError("Invalid session fields", 400, fieldErrors);
    }

    const base = {
      providerSeatsAvailable: seats,
      manualSeatsAvailable: null as number | null,
      seatCap: seatCapOverride,
    };
    const withSeats = withSeatsDisplayed(base, nextDeal);
    const status = sessionStatusFromExternal(ext, seats);

    if (existing) {
      const updated: DealSession = {
        ...existing,
        startAt: ext.startAt,
        endAt: ext.endAt,
        providerSeatsAvailable: seats,
        manualSeatsAvailable: null,
        seatCap: seatCapOverride,
        seatsDisplayed: withSeats.seatsDisplayed,
        status,
        lastSyncedAt: ext.lastSyncedAt ?? now,
        updatedAt: now,
      };
      store.sessions.set(existing.id, updated);
      resultSessions.push(updated);
    } else {
      const created: DealSession = {
        id: crypto.randomUUID(),
        dealId,
        externalSessionId: ext.id,
        startAt: ext.startAt,
        endAt: ext.endAt,
        providerSeatsAvailable: seats,
        manualSeatsAvailable: null,
        seatCap: seatCapOverride,
        seatsDisplayed: withSeats.seatsDisplayed,
        status,
        lastSyncedAt: ext.lastSyncedAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      store.sessions.set(created.id, created);
      resultSessions.push(created);
      added.push(created);
    }
  }

  resultSessions.sort((a, b) => a.startAt.localeCompare(b.startAt));

  const capacityChanged =
    nextDeal.capacityMode !== deal.capacityMode ||
    nextDeal.seatCap !== deal.seatCap;
  if (capacityChanged) {
    store.deals.set(dealId, nextDeal);
    logDealEvent(
      store.audit,
      dealId,
      "updated",
      options.actor,
      {
        fields: [
          ...(nextDeal.capacityMode !== deal.capacityMode
            ? ["capacity_mode"]
            : []),
          ...(nextDeal.seatCap !== deal.seatCap ? ["seat_cap"] : []),
        ],
      },
      { now }
    );
  }

  for (const s of added) {
    logDealEvent(
      store.audit,
      dealId,
      "session_added",
      options.actor,
      {
        session_id: s.id,
        external_session_id: s.externalSessionId,
        start_at: s.startAt,
        seats_displayed: s.seatsDisplayed,
      },
      { now }
    );
  }
  for (const s of removed) {
    logDealEvent(
      store.audit,
      dealId,
      "session_removed",
      options.actor,
      {
        session_id: s.id,
        external_session_id: s.externalSessionId,
        start_at: s.startAt,
      },
      { now }
    );
  }

  // Fresh validation after mutation
  const validate =
    options.validateForPublish ??
    createValidateForPublishFromStore(store, {
      now,
      refreshStaleLinks: false,
    });
  const freshValidation = await Promise.resolve(
    validate(store.deals.get(dealId) ?? nextDeal)
  );

  return {
    deal: store.deals.get(dealId) ?? nextDeal,
    sessions: resultSessions,
    validation: freshValidation,
    note: CAPACITY_CAP_NOTE,
  };
}

/**
 * Update capacity_mode / seat_cap (and optional per-session caps) without
 * changing which sessions are selected. Recomputes seats_displayed.
 */
export async function updateIntegratedCapacity(
  store: DealDraftStore,
  dealId: string,
  raw: {
    capacity_mode?: "live_provider" | "live_provider_capped";
    seat_cap?: number | null;
    session_seat_caps?: Record<string, number | null>;
  },
  options: IntegratedAvailabilityMutationOptions
): Promise<SelectIntegratedSessionsResult> {
  const deal = requireDeal(store, dealId);
  requireIntegratedDeal(deal);
  const current = sessionsForDeal(store, dealId)
    .map((s) => s.externalSessionId)
    .filter((id): id is string => id != null);

  if (current.length === 0) {
    // Still allow capacity patch on the deal when no sessions yet
    await assertLiveConfirmOrThrow(store, deal, options);
    const now = options.now ?? new Date().toISOString();
    let next = deal;

    if (raw.capacity_mode !== undefined) {
      if (
        raw.capacity_mode !== "live_provider" &&
        raw.capacity_mode !== "live_provider_capped"
      ) {
        throw new DealDraftError(
          "capacity_mode must be live_provider or live_provider_capped",
          400,
          [{ field: "capacity_mode", message: "invalid value" }]
        );
      }
      next = { ...next, capacityMode: raw.capacity_mode, updatedAt: now };
    }

    if (raw.seat_cap !== undefined || raw.capacity_mode !== undefined) {
      if (next.capacityMode === "live_provider") {
        next = {
          ...next,
          seatCap:
            raw.seat_cap === undefined
              ? null
              : parseSeatCap(raw.seat_cap, "seat_cap") ?? null,
          updatedAt: now,
        };
      } else if (next.capacityMode === "live_provider_capped") {
        const cap =
          raw.seat_cap !== undefined
            ? parseSeatCap(raw.seat_cap, "seat_cap")
            : next.seatCap;
        if (cap == null) {
          throw new DealDraftError(
            "seat_cap is required when capacity_mode is live_provider_capped",
            400,
            [{ field: "seat_cap", message: "required for live_provider_capped" }]
          );
        }
        next = { ...next, seatCap: cap, updatedAt: now };
      }
    }

    const fields: string[] = [];
    if (next.capacityMode !== deal.capacityMode) fields.push("capacity_mode");
    if (next.seatCap !== deal.seatCap) fields.push("seat_cap");
    store.deals.set(dealId, next);
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

    const validate =
      options.validateForPublish ??
      createValidateForPublishFromStore(store, {
        now,
        refreshStaleLinks: false,
      });
    return {
      deal: next,
      sessions: [],
      validation: await Promise.resolve(validate(next)),
      note: CAPACITY_CAP_NOTE,
    };
  }

  return selectIntegratedSessions(
    store,
    dealId,
    {
      external_session_ids: current,
      capacity_mode: raw.capacity_mode,
      seat_cap: raw.seat_cap,
      session_seat_caps: raw.session_seat_caps,
    },
    options
  );
}
