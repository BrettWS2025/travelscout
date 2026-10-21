/**
 * Sync engine and sync log (deals platform Chunk 28).
 *
 * runSync: listProducts → upsert ExternalProduct; for enabled products,
 * listSessions (now → now+MAX_LEAD_HOURS+24h) → upsert ExternalSession;
 * mark missing sessions cancelled; refresh linked DealSession seats;
 * hand off to Chunk 35 hooks (stubs until that chunk).
 *
 * One sync per integration at a time (lock). Adapter calls retry with backoff.
 * Content fields on Deal are never overwritten here (Chunk 32 / overridden_fields).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { getPlatformConfig, MAX_LEAD_HOURS } from "./config";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  withSeatsDisplayed,
  type DealSession,
} from "./deal-session";
import {
  clearAutoPause,
  type DealActor,
} from "./deal-status";
import { clearSyncFailurePausesForIntegration } from "./integration-stale-sync";
import {
  isIntegrationProvider,
  isSyncType,
  type SessionStatus,
  type SyncType,
} from "./enums";
import {
  type ExternalProduct,
  type ExternalSession,
  type Integration,
  type SyncLog,
  type SyncLogStatus,
} from "./integration";
import {
  ensureIntegrationSecretsConfigured,
  findActiveIntegration,
  serializeSyncLog,
} from "./integration-connect";
import {
  AdapterOperationError,
  getAdapter,
  type NormalisedProduct,
  type NormalisedSession,
  type ProviderWebhookEvent,
  type ProviderWebhookRequest,
} from "./providers";
import { readSecret } from "./secrets";

// ---------------------------------------------------------------------------
// Constants / errors
// ---------------------------------------------------------------------------

/** Extra hours beyond MAX_LEAD_HOURS when fetching sessions (spec: +24h buffer). */
export const SYNC_SESSION_BUFFER_HOURS = 24;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 50;

export class IntegrationSyncError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "IntegrationSyncError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

function ensureIntegrationsMap(
  store: DealDraftStore
): Map<string, Integration> {
  if (!store.integrations) store.integrations = new Map();
  return store.integrations;
}

function ensureSyncLogsMap(store: DealDraftStore): Map<string, SyncLog> {
  if (!store.syncLogs) store.syncLogs = new Map();
  return store.syncLogs;
}

function ensureExternalProductsMap(
  store: DealDraftStore
): Map<string, ExternalProduct> {
  if (!store.externalProducts) store.externalProducts = new Map();
  return store.externalProducts;
}

function ensureExternalSessionsMap(
  store: DealDraftStore
): Map<string, ExternalSession> {
  if (!store.externalSessions) store.externalSessions = new Map();
  return store.externalSessions;
}

function ensurePollStateMap(
  store: DealDraftStore
): Map<string, { lastPollStartedAt: string }> {
  if (!store.integrationPollState) store.integrationPollState = new Map();
  return store.integrationPollState;
}

function requireIntegration(
  store: DealDraftStore,
  integrationId: string
): Integration {
  const row = ensureIntegrationsMap(store).get(integrationId);
  if (!row) {
    throw new IntegrationSyncError("Integration not found", 404, "not_found");
  }
  return row;
}

function saveIntegration(store: DealDraftStore, integration: Integration): void {
  ensureIntegrationsMap(store).set(integration.id, integration);
}

function productsForIntegration(
  store: DealDraftStore,
  integrationId: string
): ExternalProduct[] {
  return [...ensureExternalProductsMap(store).values()].filter(
    (p) => p.integrationId === integrationId
  );
}

function sessionsForProduct(
  store: DealDraftStore,
  externalProductId: string
): ExternalSession[] {
  return [...ensureExternalSessionsMap(store).values()].filter(
    (s) => s.externalProductId === externalProductId
  );
}

function dealsForIntegration(
  store: DealDraftStore,
  integrationId: string
): Deal[] {
  return [...store.deals.values()].filter(
    (d) => d.integrationId === integrationId
  );
}

// ---------------------------------------------------------------------------
// Lock + retry
// ---------------------------------------------------------------------------

/** In-flight sync locks (process-local; one sync per integration). */
const syncLocks = new Set<string>();

/** Test helper — clear locks between cases. */
export function resetSyncLocks(): void {
  syncLocks.clear();
}

export function isSyncLocked(integrationId: string): boolean {
  return syncLocks.has(integrationId);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type RetryOptions = {
  maxAttempts?: number;
  baseBackoffMs?: number;
  /** Injected for tests — skip real delays when 0. */
  sleepFn?: (ms: number) => Promise<void>;
};

/**
 * Retry an async adapter call with exponential backoff.
 * Non-retryable IntegrationSyncError / 4xx-style AdapterOperationError still throw.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = options?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const sleeper = options?.sleepFn ?? sleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      // Don't retry credential / not-found style failures
      if (
        err instanceof AdapterOperationError &&
        ["missing_credentials", "invalid_credentials", "not_found"].includes(
          err.code
        )
      ) {
        break;
      }
      await sleeper(base * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Chunk 35 hooks (stubs)
// ---------------------------------------------------------------------------

export type PostSyncHookContext = {
  store: DealDraftStore;
  integration: Integration;
  affectedDealIds: string[];
  updatedExternalSessionIds: string[];
  cancelledExternalSessionIds: string[];
  now: string;
};

/**
 * Called after a successful product/session upsert. Chunk 35 fills in
 * session_cancelled / price_below_threshold auto-pauses. No-op until then.
 */
export async function runPostSyncProviderHooks(
  _ctx: PostSyncHookContext
): Promise<void> {
  // Chunk 35: cancellation + price checks
}

// ---------------------------------------------------------------------------
// Sync window
// ---------------------------------------------------------------------------

export function syncSessionWindow(
  now: Date,
  maxLeadHours = getPlatformConfig().MAX_LEAD_HOURS ?? MAX_LEAD_HOURS
): { from: Date; to: Date } {
  const from = now;
  const to = new Date(
    now.getTime() + (maxLeadHours + SYNC_SESSION_BUFFER_HOURS) * 60 * 60 * 1000
  );
  return { from, to };
}

function newSyncLog(
  integrationId: string,
  syncType: SyncType,
  now: string,
  status: SyncLogStatus = "running"
): SyncLog {
  return {
    id: crypto.randomUUID(),
    integrationId,
    syncType,
    status,
    startedAt: now,
    finishedAt: null,
    itemsProcessed: 0,
    errorCode: null,
    errorMessage: null,
    affectedDealIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function readableSyncError(err: unknown): { code: string; message: string } {
  if (err instanceof AdapterOperationError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof IntegrationSyncError) {
    return { code: err.code ?? "sync_error", message: err.message };
  }
  if (err instanceof Error && err.message) {
    return { code: "sync_failed", message: err.message };
  }
  return { code: "sync_failed", message: "Sync failed" };
}

// ---------------------------------------------------------------------------
// Upsert products / sessions
// ---------------------------------------------------------------------------

function upsertProduct(
  store: DealDraftStore,
  integration: Integration,
  normalised: NormalisedProduct,
  now: string
): { product: ExternalProduct; created: boolean } {
  const map = ensureExternalProductsMap(store);
  const existing = [...map.values()].find(
    (p) =>
      p.integrationId === integration.id &&
      p.externalId === normalised.external_id
  );

  if (existing) {
    const updated: ExternalProduct = {
      ...existing,
      name: normalised.name,
      description: normalised.description,
      images: [...normalised.images],
      durationMinutes: normalised.duration_minutes,
      location: normalised.location ? { ...normalised.location } : {},
      priceOptions: normalised.price_options.map((po) => ({ ...po })),
      archivedInProvider: normalised.archived,
      rawPayload: { external_id: normalised.external_id },
      lastSyncedAt: now,
      updatedAt: now,
    };
    map.set(updated.id, updated);
    return { product: updated, created: false };
  }

  const created: ExternalProduct = {
    id: crypto.randomUUID(),
    integrationId: integration.id,
    externalId: normalised.external_id,
    name: normalised.name,
    description: normalised.description,
    images: [...normalised.images],
    durationMinutes: normalised.duration_minutes,
    location: normalised.location ? { ...normalised.location } : {},
    priceOptions: normalised.price_options.map((po) => ({ ...po })),
    isEnabledForDeals: integration.autoEnableNewProducts === true,
    archivedInProvider: normalised.archived,
    rawPayload: { external_id: normalised.external_id },
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  map.set(created.id, created);
  return { product: created, created: true };
}

function mapSessionStatus(status: SessionStatus | string): SessionStatus {
  if (
    status === "live" ||
    status === "sold_out" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    return status;
  }
  return "live";
}

function upsertSession(
  store: DealDraftStore,
  product: ExternalProduct,
  normalised: NormalisedSession,
  now: string
): { session: ExternalSession; created: boolean } {
  const map = ensureExternalSessionsMap(store);
  const existing = [...map.values()].find(
    (s) =>
      s.externalProductId === product.id &&
      s.externalId === normalised.external_id
  );

  if (existing) {
    const updated: ExternalSession = {
      ...existing,
      startAt: normalised.start_at,
      endAt: normalised.end_at,
      seatsAvailable: normalised.seats_available,
      totalCapacity: normalised.total_capacity,
      status: mapSessionStatus(normalised.status),
      prices: normalised.prices.map((p) => ({ ...p })),
      lastSyncedAt: now,
      updatedAt: now,
    };
    map.set(updated.id, updated);
    return { session: updated, created: false };
  }

  const created: ExternalSession = {
    id: crypto.randomUUID(),
    externalProductId: product.id,
    externalId: normalised.external_id,
    startAt: normalised.start_at,
    endAt: normalised.end_at,
    seatsAvailable: normalised.seats_available,
    totalCapacity: normalised.total_capacity,
    status: mapSessionStatus(normalised.status),
    prices: normalised.prices.map((p) => ({ ...p })),
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  map.set(created.id, created);
  return { session: created, created: true };
}

function markMissingSessionsCancelled(
  store: DealDraftStore,
  product: ExternalProduct,
  seenExternalIds: Set<string>,
  window: { from: Date; to: Date },
  now: string
): string[] {
  const cancelledIds: string[] = [];
  const map = ensureExternalSessionsMap(store);
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();

  for (const session of sessionsForProduct(store, product.id)) {
    if (seenExternalIds.has(session.externalId)) continue;
    const startMs = Date.parse(session.startAt);
    if (!Number.isFinite(startMs) || startMs < fromMs || startMs > toMs) {
      continue;
    }
    if (session.status === "cancelled") continue;
    const updated: ExternalSession = {
      ...session,
      status: "cancelled",
      seatsAvailable: 0,
      lastSyncedAt: now,
      updatedAt: now,
    };
    map.set(updated.id, updated);
    cancelledIds.push(updated.id);
  }
  return cancelledIds;
}

/**
 * Push provider seats onto linked DealSessions and recompute seats_displayed.
 * Does not touch Deal content / overridden_fields (Chunk 32).
 */
function updateLinkedDealSessions(
  store: DealDraftStore,
  externalSession: ExternalSession,
  now: string
): string[] {
  const affectedDealIds: string[] = [];
  for (const [id, dealSession] of store.sessions) {
    if (dealSession.externalSessionId !== externalSession.id) continue;
    const deal = store.deals.get(dealSession.dealId);
    if (!deal) continue;

    const seats =
      externalSession.status === "cancelled"
        ? 0
        : Math.max(0, externalSession.seatsAvailable ?? 0);

    let next: DealSession = {
      ...dealSession,
      providerSeatsAvailable: seats,
      lastSyncedAt: now,
      updatedAt: now,
      status:
        externalSession.status === "cancelled"
          ? "cancelled"
          : seats === 0
            ? "sold_out"
            : dealSession.status === "cancelled" ||
                dealSession.status === "expired"
              ? dealSession.status
              : "live",
    };
    next = withSeatsDisplayed(next, deal);
    store.sessions.set(id, next);
    if (!affectedDealIds.includes(deal.id)) affectedDealIds.push(deal.id);
  }
  return affectedDealIds;
}

// ---------------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------------

export type RunSyncOptions = {
  now?: string | Date;
  actor?: DealActor;
  /** Limit session upsert to these ExternalProduct.externalId values. */
  productExternalIds?: string[];
  retry?: RetryOptions;
  /** When true (default), clear integration_disconnected after success. */
  clearDisconnectedPauses?: boolean;
};

export type RunSyncResult = {
  sync_log: SyncLog;
  integration: Integration;
  resumed_deal_ids: string[];
  items_processed: number;
  affected_deal_ids: string[];
};

/**
 * Run a provider sync for one integration. Creates a SyncLog (running →
 * success|failed). One sync per integration at a time.
 */
export async function runSync(
  store: DealDraftStore,
  integrationId: string,
  type: SyncType,
  options?: RunSyncOptions
): Promise<RunSyncResult> {
  if (!isSyncType(type)) {
    throw new IntegrationSyncError(
      `Invalid sync type: ${String(type)}`,
      400,
      "invalid_sync_type"
    );
  }

  const integration = requireIntegration(store, integrationId);
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded" &&
    integration.status !== "connecting"
  ) {
    throw new IntegrationSyncError(
      `Cannot sync while integration status is ${integration.status}.`,
      409,
      "invalid_status"
    );
  }
  if (!integration.credentialsRef) {
    throw new IntegrationSyncError(
      "Integration has no stored credentials.",
      400,
      "missing_credentials"
    );
  }

  if (syncLocks.has(integrationId)) {
    throw new IntegrationSyncError(
      "A sync is already running for this integration.",
      409,
      "sync_in_progress"
    );
  }

  ensureIntegrationSecretsConfigured();
  syncLocks.add(integrationId);

  const nowDate =
    options?.now instanceof Date
      ? options.now
      : options?.now
        ? new Date(options.now)
        : new Date();
  const now = nowDate.toISOString();
  const logs = ensureSyncLogsMap(store);
  const log = newSyncLog(integrationId, type, now, "running");
  logs.set(log.id, log);

  // Always bump last_sync_at when a run starts
  let current: Integration = {
    ...integration,
    lastSyncAt: now,
    updatedAt: now,
  };
  saveIntegration(store, current);

  const affectedDealIds = new Set<string>();
  const updatedExternalSessionIds: string[] = [];
  const cancelledExternalSessionIds: string[] = [];
  let itemsProcessed = 0;
  const resumed: string[] = [];

  try {
    const adapter = getAdapter(current.provider);
    const retryOpts = options?.retry;

    const products = await withRetry(
      () => adapter.listProducts(current),
      retryOpts
    );

    const filterIds =
      options?.productExternalIds && options.productExternalIds.length > 0
        ? new Set(options.productExternalIds)
        : null;

    const seenProductExternalIds = new Set<string>();
    const upsertedProducts: ExternalProduct[] = [];

    for (const normalised of products) {
      if (filterIds && !filterIds.has(normalised.external_id)) continue;
      seenProductExternalIds.add(normalised.external_id);
      const { product } = upsertProduct(store, current, normalised, now);
      upsertedProducts.push(product);
      itemsProcessed += 1;
    }

    // Products previously known but missing from provider → archived
    if (!filterIds) {
      for (const existing of productsForIntegration(store, integrationId)) {
        if (seenProductExternalIds.has(existing.externalId)) continue;
        if (existing.archivedInProvider) continue;
        const map = ensureExternalProductsMap(store);
        const archived: ExternalProduct = {
          ...existing,
          archivedInProvider: true,
          lastSyncedAt: now,
          updatedAt: now,
        };
        map.set(archived.id, archived);
        itemsProcessed += 1;
      }
    }

    const window = syncSessionWindow(nowDate);
    const productsToSyncSessions = upsertedProducts.filter(
      (p) => p.isEnabledForDeals && !p.archivedInProvider
    );

    // Also refresh sessions for already-enabled products when filtering
    if (filterIds) {
      for (const p of productsForIntegration(store, integrationId)) {
        if (
          filterIds.has(p.externalId) &&
          p.isEnabledForDeals &&
          !p.archivedInProvider &&
          !productsToSyncSessions.some((x) => x.id === p.id)
        ) {
          productsToSyncSessions.push(p);
        }
      }
    }

    for (const product of productsToSyncSessions) {
      const sessions = await withRetry(
        () =>
          adapter.listSessions(
            current,
            product.externalId,
            window.from,
            window.to
          ),
        retryOpts
      );

      const seenSessionIds = new Set<string>();
      for (const normalised of sessions) {
        seenSessionIds.add(normalised.external_id);
        const { session } = upsertSession(store, product, normalised, now);
        updatedExternalSessionIds.push(session.id);
        itemsProcessed += 1;
        for (const dealId of updateLinkedDealSessions(store, session, now)) {
          affectedDealIds.add(dealId);
        }
      }

      const cancelled = markMissingSessionsCancelled(
        store,
        product,
        seenSessionIds,
        window,
        now
      );
      for (const id of cancelled) {
        cancelledExternalSessionIds.push(id);
        itemsProcessed += 1;
        const ext = ensureExternalSessionsMap(store).get(id);
        if (!ext) continue;
        for (const dealId of updateLinkedDealSessions(store, ext, now)) {
          affectedDealIds.add(dealId);
        }
      }
    }

    // Deals linked to this integration count as affected even without session rows
    for (const deal of dealsForIntegration(store, integrationId)) {
      if (
        deal.externalProductId &&
        ensureExternalProductsMap(store).has(deal.externalProductId)
      ) {
        affectedDealIds.add(deal.id);
      }
    }

    await runPostSyncProviderHooks({
      store,
      integration: current,
      affectedDealIds: [...affectedDealIds],
      updatedExternalSessionIds,
      cancelledExternalSessionIds,
      now,
    });

    const finishedAt = new Date(
      Math.max(Date.now(), nowDate.getTime())
    ).toISOString();
    // Prefer deterministic `now` when caller fixed the clock
    const finishIso =
      options?.now != null
        ? typeof options.now === "string"
          ? options.now
          : options.now.toISOString()
        : finishedAt;

    const successLog: SyncLog = {
      ...log,
      status: "success",
      finishedAt: finishIso,
      itemsProcessed,
      affectedDealIds: [...affectedDealIds],
      errorCode: null,
      errorMessage: null,
      updatedAt: finishIso,
    };
    logs.set(successLog.id, successLog);

    current = {
      ...current,
      status:
        current.status === "connecting" || current.status === "degraded"
          ? "connected"
          : current.status === "error"
            ? "connected"
            : current.status,
      lastSuccessfulSyncAt: finishIso,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: finishIso,
    };
    saveIntegration(store, current);

    const clearPauses = options?.clearDisconnectedPauses !== false;
    if (clearPauses) {
      for (const deal of dealsForIntegration(store, integrationId)) {
        if (
          deal.status === "auto_paused" &&
          deal.pauseReason === "integration_disconnected"
        ) {
          try {
            await clearAutoPause(store, deal.id, "integration_disconnected", {
              actor: options?.actor ?? { type: "system" },
              now: finishIso,
              validateForPublish: () => ({ ok: true, checks: [] }),
            });
            resumed.push(deal.id);
          } catch {
            // Operator resumes manually if validation fails
          }
        }
      }

      // Chunk 29: successful sync clears sync_failure auto-pauses + notify incident
      const syncFailureCleared = await clearSyncFailurePausesForIntegration(
        store,
        integrationId,
        {
          actor: options?.actor ?? { type: "system" },
          now: finishIso,
          validateForPublish: () => ({ ok: true, checks: [] }),
        }
      );
      for (const id of syncFailureCleared.resumedDealIds) {
        if (!resumed.includes(id)) resumed.push(id);
      }
    }

    return {
      sync_log: successLog,
      integration: current,
      resumed_deal_ids: resumed,
      items_processed: itemsProcessed,
      affected_deal_ids: [...affectedDealIds],
    };
  } catch (err) {
    const { code, message } = readableSyncError(err);
    const failIso =
      options?.now != null
        ? typeof options.now === "string"
          ? options.now
          : options.now.toISOString()
        : new Date().toISOString();

    const failedLog: SyncLog = {
      ...log,
      status: "failed",
      finishedAt: failIso,
      itemsProcessed,
      errorCode: code,
      errorMessage: message,
      affectedDealIds: [...affectedDealIds],
      updatedAt: failIso,
    };
    logs.set(failedLog.id, failedLog);

    current = {
      ...current,
      lastErrorCode: code,
      lastErrorMessage: message,
      updatedAt: failIso,
    };
    saveIntegration(store, current);

    return {
      sync_log: failedLog,
      integration: current,
      resumed_deal_ids: [],
      items_processed: itemsProcessed,
      affected_deal_ids: [...affectedDealIds],
    };
  } finally {
    syncLocks.delete(integrationId);
  }
}

// ---------------------------------------------------------------------------
// API helpers: products, sync-log, resync, refresh
// ---------------------------------------------------------------------------

function requireActiveProvider(
  store: DealDraftStore,
  operatorId: string,
  provider: string
): Integration {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationSyncError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationSyncError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }
  return integration;
}

export type ExternalProductListItem = {
  id: string;
  external_id: string;
  name: string;
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string | null;
  sessions_next_72h: number;
  is_enabled_for_deals: boolean;
  archived_in_provider: boolean;
  last_synced_at: string | null;
};

function priceRange(product: ExternalProduct): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const options = Array.isArray(product.priceOptions)
    ? product.priceOptions
    : [];
  let min: number | null = null;
  let max: number | null = null;
  let currency: string | null = null;
  for (const raw of options) {
    if (!raw || typeof raw !== "object") continue;
    const po = raw as { price_minor?: unknown; currency?: unknown };
    if (typeof po.price_minor !== "number" || !Number.isFinite(po.price_minor)) {
      continue;
    }
    min = min == null ? po.price_minor : Math.min(min, po.price_minor);
    max = max == null ? po.price_minor : Math.max(max, po.price_minor);
    if (typeof po.currency === "string" && !currency) currency = po.currency;
  }
  return { min, max, currency };
}

function sessionsInNextLeadHours(
  store: DealDraftStore,
  productId: string,
  now: Date,
  leadHours: number
): number {
  const until = now.getTime() + leadHours * 60 * 60 * 1000;
  const nowMs = now.getTime();
  return sessionsForProduct(store, productId).filter((s) => {
    if (s.status === "cancelled" || s.status === "expired") return false;
    const t = Date.parse(s.startAt);
    return Number.isFinite(t) && t >= nowMs && t <= until;
  }).length;
}

export function listIntegrationProducts(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  options?: { now?: string | Date }
): ExternalProductListItem[] {
  const integration = requireActiveProvider(store, operatorId, provider);
  const nowDate =
    options?.now instanceof Date
      ? options.now
      : options?.now
        ? new Date(options.now)
        : new Date();
  const lead = getPlatformConfig().MAX_LEAD_HOURS ?? MAX_LEAD_HOURS;

  return productsForIntegration(store, integration.id)
    .map((p) => {
      const range = priceRange(p);
      return {
        id: p.id,
        external_id: p.externalId,
        name: p.name,
        price_min_minor: range.min,
        price_max_minor: range.max,
        currency: range.currency,
        sessions_next_72h: sessionsInNextLeadHours(store, p.id, nowDate, lead),
        is_enabled_for_deals: p.isEnabledForDeals,
        archived_in_provider: p.archivedInProvider,
        last_synced_at: p.lastSyncedAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setProductEnabledForDeals(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  productId: string,
  isEnabled: boolean,
  options?: { now?: string }
): ExternalProduct {
  const integration = requireActiveProvider(store, operatorId, provider);
  const map = ensureExternalProductsMap(store);
  const product = map.get(productId);
  if (!product || product.integrationId !== integration.id) {
    throw new IntegrationSyncError("Product not found", 404, "product_not_found");
  }
  const now = options?.now ?? new Date().toISOString();
  const updated: ExternalProduct = {
    ...product,
    isEnabledForDeals: isEnabled,
    updatedAt: now,
  };
  map.set(updated.id, updated);
  return updated;
}

export type SyncLogListQuery = {
  status?: SyncLogStatus | SyncLogStatus[];
  sync_type?: SyncType | SyncType[];
  limit?: number;
};

export function listSyncLogs(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  query?: SyncLogListQuery
): Array<Record<string, unknown>> {
  const integration = requireActiveProvider(store, operatorId, provider);
  const statusFilter = query?.status
    ? new Set(Array.isArray(query.status) ? query.status : [query.status])
    : null;
  const typeFilter = query?.sync_type
    ? new Set(
        Array.isArray(query.sync_type) ? query.sync_type : [query.sync_type]
      )
    : null;
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

  const rows = [...ensureSyncLogsMap(store).values()]
    .filter((l) => l.integrationId === integration.id)
    .filter((l) => (statusFilter ? statusFilter.has(l.status) : true))
    .filter((l) => (typeFilter ? typeFilter.has(l.syncType) : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);

  return rows.map((log) => {
    const serialized = serializeSyncLog(log);
    const affected = (log.affectedDealIds ?? []).map((id) => {
      const deal = store.deals.get(id);
      return deal
        ? { id: deal.id, title: deal.title, status: deal.status }
        : { id, title: null, status: null };
    });
    return {
      ...serialized,
      error_message_readable: log.errorMessage,
      affected_deals: affected,
    };
  });
}

export async function resyncIntegration(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  options?: { now?: string; actor?: DealActor }
): Promise<RunSyncResult> {
  const integration = requireActiveProvider(store, operatorId, provider);
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded"
  ) {
    throw new IntegrationSyncError(
      `Cannot resync while status is ${integration.status}.`,
      409,
      "invalid_status"
    );
  }
  return runSync(store, integration.id, "manual", {
    now: options?.now,
    actor: options?.actor ?? { type: "system" },
  });
}

export async function refreshIntegrationProducts(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  options?: { now?: string; actor?: DealActor }
): Promise<RunSyncResult> {
  const integration = requireActiveProvider(store, operatorId, provider);
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded"
  ) {
    throw new IntegrationSyncError(
      `Cannot refresh products while status is ${integration.status}.`,
      409,
      "invalid_status"
    );
  }
  // Same as full catalogue refresh (products + enabled sessions)
  return runSync(store, integration.id, "full", {
    now: options?.now,
    actor: options?.actor ?? { type: "system" },
  });
}

// ---------------------------------------------------------------------------
// Poll scheduler
// ---------------------------------------------------------------------------

export type PollJobResult = {
  checked: number;
  started: string[];
  skipped_locked: string[];
  results: RunSyncResult[];
};

/**
 * Poll each connected integration whose poll_interval_seconds has elapsed.
 * Call from a cron (e.g. every minute). Idempotent per interval.
 */
export async function runIntegrationPollJob(
  store: DealDraftStore,
  options?: { now?: string | Date; actor?: DealActor }
): Promise<PollJobResult> {
  const nowDate =
    options?.now instanceof Date
      ? options.now
      : options?.now
        ? new Date(options.now)
        : new Date();
  const nowIso = nowDate.toISOString();
  const pollState = ensurePollStateMap(store);
  const started: string[] = [];
  const skipped_locked: string[] = [];
  const results: RunSyncResult[] = [];
  let checked = 0;

  for (const integration of ensureIntegrationsMap(store).values()) {
    if (integration.status !== "connected" && integration.status !== "degraded") {
      continue;
    }
    if (
      integration.syncMode === "webhook" // pure webhook — no poll
    ) {
      continue;
    }
    const interval = integration.pollIntervalSeconds ?? 300;
    checked += 1;

    const last = pollState.get(integration.id)?.lastPollStartedAt;
    if (last) {
      const elapsedSec =
        (nowDate.getTime() - Date.parse(last)) / 1000;
      if (elapsedSec < interval) continue;
    } else if (integration.lastSuccessfulSyncAt) {
      const elapsedSec =
        (nowDate.getTime() - Date.parse(integration.lastSuccessfulSyncAt)) /
        1000;
      if (elapsedSec < interval) continue;
    }

    if (syncLocks.has(integration.id)) {
      skipped_locked.push(integration.id);
      continue;
    }

    pollState.set(integration.id, { lastPollStartedAt: nowIso });
    started.push(integration.id);
    const result = await runSync(store, integration.id, "incremental", {
      now: nowIso,
      actor: options?.actor ?? { type: "system" },
    });
    results.push(result);
  }

  return { checked, started, skipped_locked, results };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function headerValue(
  headers: ProviderWebhookRequest["headers"],
  name: string
): string | null {
  const lower = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(lower);
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0] ?? null;
      return v ?? null;
    }
  }
  return null;
}

function bodyAsString(body: unknown): string {
  if (typeof body === "string") return body;
  return JSON.stringify(body ?? {});
}

/**
 * Verify webhook HMAC-SHA256 signature.
 * Accepts header `x-webhook-signature` or `x-signature` as hex digest of body.
 */
export function verifyWebhookSignature(
  secret: string,
  body: unknown,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret)
    .update(bodyAsString(body), "utf8")
    .digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type HandleWebhookResult = {
  ok: boolean;
  events: ProviderWebhookEvent[];
  sync?: RunSyncResult;
  error?: string;
};

/**
 * Provider webhook: verify signature via webhook_secret_ref, bump
 * webhook_last_received_at, run incremental sync for affected products.
 */
export async function handleIntegrationWebhook(
  store: DealDraftStore,
  provider: string,
  request: ProviderWebhookRequest,
  options?: {
    /** When set, only this operator's integration is considered. */
    operatorId?: string;
    now?: string;
    actor?: DealActor;
  }
): Promise<HandleWebhookResult> {
  ensureIntegrationSecretsConfigured();

  const candidates = [...ensureIntegrationsMap(store).values()].filter(
    (i) =>
      i.provider === provider &&
      (i.status === "connected" || i.status === "degraded") &&
      (options?.operatorId ? i.operatorId === options.operatorId : true)
  );

  if (candidates.length === 0) {
    throw new IntegrationSyncError(
      "No connected integration for this provider.",
      404,
      "not_connected"
    );
  }

  // Prefer the integration that has a webhook secret; otherwise first match
  const integration =
    candidates.find((c) => c.webhookSecretRef) ?? candidates[0]!;

  if (integration.webhookSecretRef) {
    const secret = await readSecret(integration.webhookSecretRef);
    const sig =
      headerValue(request.headers, "x-webhook-signature") ??
      headerValue(request.headers, "x-signature");
    if (!verifyWebhookSignature(secret, request.body, sig)) {
      throw new IntegrationSyncError(
        "Invalid webhook signature.",
        401,
        "invalid_signature"
      );
    }
  }

  const now = options?.now ?? new Date().toISOString();
  saveIntegration(store, {
    ...integration,
    webhookLastReceivedAt: now,
    updatedAt: now,
  });

  const adapter = getAdapter(provider);
  let events: ProviderWebhookEvent[] = [];
  if (adapter.handleWebhook) {
    events = await adapter.handleWebhook(request);
  }

  // Fallback: body.product_external_id / products[]
  if (events.length === 0 && request.body && typeof request.body === "object") {
    const body = request.body as Record<string, unknown>;
    if (typeof body.product_external_id === "string") {
      events.push({
        type: "product_updated",
        product_external_id: body.product_external_id,
      });
    }
    if (Array.isArray(body.products)) {
      for (const p of body.products) {
        if (typeof p === "string") {
          events.push({ type: "product_updated", product_external_id: p });
        } else if (
          p &&
          typeof p === "object" &&
          typeof (p as { external_id?: unknown }).external_id === "string"
        ) {
          events.push({
            type: "product_updated",
            product_external_id: (p as { external_id: string }).external_id,
          });
        }
      }
    }
  }

  const productIds = [
    ...new Set(
      events
        .map((e) => e.product_external_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const sync = await runSync(store, integration.id, "webhook", {
    now,
    actor: options?.actor ?? { type: "system" },
    productExternalIds: productIds.length > 0 ? productIds : undefined,
  });

  return { ok: sync.sync_log.status === "success", events, sync };
}

