/**
 * Stale-sync monitor and integration auto-pause (deals platform Chunk 29).
 *
 * Every-minute job:
 * - Connected/degraded integrations whose last_successful_sync_at is older than
 *   SYNC_STALE_MINUTES → status degraded, applyAutoPause(sync_failure) on live
 *   deals, notify integration_sync_failing once per incident.
 * - error / disconnected → applyAutoPause(integration_disconnected) on
 *   live/scheduled deals (catch-up if disconnect path was skipped).
 * - When last sync is fresh again → status connected and clear sync_failure
 *   (also cleared immediately from runSync on success).
 *
 * Spec: docs/deals-spec.md §4.3, §4.5.
 */

import { getPlatformConfig } from "./config";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  applyAutoPause,
  clearAutoPause,
  InvalidDealTransitionError,
  type DealActor,
  type DealStatusStore,
  type ValidateForPublishFn,
} from "./deal-status";
import type { Integration } from "./integration";
import { getZonedParts } from "./timezone";

const SYSTEM_ACTOR: DealActor = { type: "system" };

// ---------------------------------------------------------------------------
// Incident tracking (notify once per stale period)
// ---------------------------------------------------------------------------

export type SyncFailureIncidentRecord = {
  integrationId: string;
  /** lastSuccessfulSyncAt (or null) when the stale incident started. */
  sinceSyncAt: string | null;
  notifiedAt: string;
};

function ensureIncidentsMap(
  store: DealDraftStore
): Map<string, SyncFailureIncidentRecord> {
  if (!store.syncFailureIncidents) store.syncFailureIncidents = new Map();
  return store.syncFailureIncidents;
}

function ensureIntegrationsMap(
  store: DealDraftStore
): Map<string, Integration> {
  if (!store.integrations) store.integrations = new Map();
  return store.integrations;
}

function asStatusStore(store: DealDraftStore): DealStatusStore {
  return { deals: store.deals, audit: store.audit };
}

function saveIntegration(store: DealDraftStore, integration: Integration): void {
  ensureIntegrationsMap(store).set(integration.id, integration);
}

function dealsForIntegration(
  store: DealDraftStore,
  integrationId: string
): Deal[] {
  return [...store.deals.values()].filter(
    (d) => d.integrationId === integrationId
  );
}

function operatorTimezone(store: DealDraftStore, operatorId: string): string {
  const op = store.operators.operators.get(operatorId);
  return op?.timezone ?? getPlatformConfig().DEFAULT_TIMEZONE;
}

export function providerDisplayName(provider: string): string {
  switch (provider) {
    case "rezdy":
      return "Rezdy";
    case "fareharbor":
      return "FareHarbor";
    case "bokun":
      return "Bókun";
    case "checkfront":
      return "Checkfront";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

/** Format wall-clock in operator TZ as "YYYY-MM-DD HH:MM". */
export function formatSyncLocalDateTime(
  isoOrDate: string | Date,
  timeZone: string
): string {
  const p = getZonedParts(isoOrDate, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function isSyncStale(
  integration: Integration,
  nowIso: string,
  staleMinutes: number = getPlatformConfig().SYNC_STALE_MINUTES
): boolean {
  const lastOk = integration.lastSuccessfulSyncAt;
  if (lastOk == null) return true;
  const ageMs = Date.parse(nowIso) - Date.parse(lastOk);
  if (!Number.isFinite(ageMs)) return true;
  return ageMs > staleMinutes * 60_000;
}

export function syncFailurePauseDetail(
  integration: Integration,
  timeZone: string
): string {
  const name = providerDisplayName(integration.provider);
  const sinceIso =
    integration.lastSuccessfulSyncAt ??
    integration.lastSyncAt ??
    integration.connectedAt ??
    integration.updatedAt;
  const local = formatSyncLocalDateTime(sinceIso, timeZone);
  return `${name} hasn't synced since ${local}`;
}

// ---------------------------------------------------------------------------
// Notification stub (Chunk 39 replaces with notify())
// ---------------------------------------------------------------------------

export type IntegrationSyncFailingNotifyPayload = {
  operatorId: string;
  integrationId: string;
  provider: string;
  detail: string;
  pausedDealIds: string[];
  at: string;
};

export type SendIntegrationSyncFailingFn = (
  payload: IntegrationSyncFailingNotifyPayload
) => void | Promise<void>;

let sendSyncFailingHook: SendIntegrationSyncFailingFn = () => {
  // no-op until notifications are wired (Chunk 39)
};

export function setSendIntegrationSyncFailing(
  fn: SendIntegrationSyncFailingFn | null
): void {
  sendSyncFailingHook = fn ?? (() => undefined);
}

export async function sendIntegrationSyncFailing(
  payload: IntegrationSyncFailingNotifyPayload
): Promise<void> {
  await sendSyncFailingHook(payload);
}

/** Clear incident so the next stale period can notify again. */
export function clearSyncFailureIncident(
  store: DealDraftStore,
  integrationId: string
): void {
  ensureIncidentsMap(store).delete(integrationId);
}

// ---------------------------------------------------------------------------
// Clear sync_failure on successful sync (called from runSync)
// ---------------------------------------------------------------------------

export type ClearSyncFailurePausesResult = {
  resumedDealIds: string[];
};

/**
 * Resume deals auto_paused for sync_failure after a successful sync.
 * Clears the notify incident for this integration.
 */
export async function clearSyncFailurePausesForIntegration(
  store: DealDraftStore,
  integrationId: string,
  options?: {
    actor?: DealActor;
    now?: string;
    validateForPublish?: ValidateForPublishFn;
  }
): Promise<ClearSyncFailurePausesResult> {
  const now = options?.now ?? new Date().toISOString();
  const actor = options?.actor ?? SYSTEM_ACTOR;
  const resumedDealIds: string[] = [];
  const validate =
    options?.validateForPublish ?? (() => ({ ok: true as const, checks: [] }));

  for (const deal of dealsForIntegration(store, integrationId)) {
    if (
      deal.status === "auto_paused" &&
      deal.pauseReason === "sync_failure"
    ) {
      try {
        await clearAutoPause(asStatusStore(store), deal.id, "sync_failure", {
          actor,
          now,
          validateForPublish: validate,
        });
        resumedDealIds.push(deal.id);
      } catch {
        // Operator resumes manually if validation fails
      }
    }
  }

  clearSyncFailureIncident(store, integrationId);
  return { resumedDealIds };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export type StaleSyncMonitorJobOptions = {
  now?: string;
  actor?: DealActor;
  /** Injected for tests. */
  validateForPublish?: ValidateForPublishFn;
};

export type StaleSyncMonitorJobResult = {
  degradedIntegrationIds: string[];
  recoveredIntegrationIds: string[];
  syncFailurePausedDealIds: string[];
  disconnectedPausedDealIds: string[];
  resumedDealIds: string[];
  notificationsSent: Array<{
    integrationId: string;
    operatorId: string;
    provider: string;
  }>;
};

function tryAutoPause(
  store: DealDraftStore,
  dealId: string,
  reason: "sync_failure" | "integration_disconnected",
  detail: string,
  now: string,
  actor: DealActor
): boolean {
  try {
    applyAutoPause(asStatusStore(store), dealId, reason, detail, {
      actor,
      now,
    });
    return true;
  } catch (err) {
    if (err instanceof InvalidDealTransitionError) return false;
    throw err;
  }
}

/**
 * Every-minute stale-sync / integration health monitor.
 * Idempotent. Uses applyAutoPause / clearAutoPause for all deal status changes.
 */
export async function runStaleSyncMonitorJob(
  store: DealDraftStore,
  options?: StaleSyncMonitorJobOptions
): Promise<StaleSyncMonitorJobResult> {
  const now = options?.now ?? new Date().toISOString();
  const actor = options?.actor ?? SYSTEM_ACTOR;
  const { SYNC_STALE_MINUTES } = getPlatformConfig();
  const incidents = ensureIncidentsMap(store);

  const degradedIntegrationIds: string[] = [];
  const recoveredIntegrationIds: string[] = [];
  const syncFailurePausedDealIds: string[] = [];
  const disconnectedPausedDealIds: string[] = [];
  const resumedDealIds: string[] = [];
  const notificationsSent: StaleSyncMonitorJobResult["notificationsSent"] = [];

  const integrations = [...ensureIntegrationsMap(store).values()];

  for (const integration of integrations) {
    const tz = operatorTimezone(store, integration.operatorId);

    // --- error / disconnected: ensure deals are auto_paused ---
    if (
      integration.status === "error" ||
      integration.status === "disconnected"
    ) {
      const detail = `${providerDisplayName(integration.provider)} is ${integration.status}`;
      for (const deal of dealsForIntegration(store, integration.id)) {
        if (deal.status !== "live" && deal.status !== "scheduled") continue;
        if (
          tryAutoPause(
            store,
            deal.id,
            "integration_disconnected",
            detail,
            now,
            actor
          )
        ) {
          disconnectedPausedDealIds.push(deal.id);
        }
      }
      continue;
    }

    // --- connected / degraded: stale vs fresh ---
    if (
      integration.status !== "connected" &&
      integration.status !== "degraded"
    ) {
      continue;
    }

    const stale = isSyncStale(integration, now, SYNC_STALE_MINUTES);

    if (stale) {
      let current = integration;
      if (current.status === "connected") {
        current = {
          ...current,
          status: "degraded",
          updatedAt: now,
        };
        saveIntegration(store, current);
        degradedIntegrationIds.push(current.id);
      }

      const detail = syncFailurePauseDetail(current, tz);
      for (const deal of dealsForIntegration(store, current.id)) {
        if (deal.status !== "live") continue;
        const before = store.deals.get(deal.id)!;
        if (
          tryAutoPause(
            store,
            deal.id,
            "sync_failure",
            detail,
            now,
            actor
          )
        ) {
          const after = store.deals.get(deal.id)!;
          if (
            before.status === "live" &&
            after.status === "auto_paused" &&
            after.pauseReason === "sync_failure"
          ) {
            syncFailurePausedDealIds.push(deal.id);
          }
        }
      }

      // Notify once per incident (keyed by lastSuccessfulSyncAt at start)
      const sinceKey = current.lastSuccessfulSyncAt;
      const existing = incidents.get(current.id);
      const sameIncident =
        existing != null && existing.sinceSyncAt === sinceKey;
      if (!sameIncident) {
        const pausedIds = dealsForIntegration(store, current.id)
          .filter(
            (d) =>
              d.status === "auto_paused" && d.pauseReason === "sync_failure"
          )
          .map((d) => d.id);

        await sendIntegrationSyncFailing({
          operatorId: current.operatorId,
          integrationId: current.id,
          provider: current.provider,
          detail,
          pausedDealIds: pausedIds,
          at: now,
        });

        incidents.set(current.id, {
          integrationId: current.id,
          sinceSyncAt: sinceKey,
          notifiedAt: now,
        });
        notificationsSent.push({
          integrationId: current.id,
          operatorId: current.operatorId,
          provider: current.provider,
        });
      }
      continue;
    }

    // Fresh sync: recover degraded → connected and clear sync_failure pauses
    if (integration.status === "degraded") {
      saveIntegration(store, {
        ...integration,
        status: "connected",
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: now,
      });
      recoveredIntegrationIds.push(integration.id);
    }

    const cleared = await clearSyncFailurePausesForIntegration(
      store,
      integration.id,
      {
        actor,
        now,
        validateForPublish: options?.validateForPublish,
      }
    );
    resumedDealIds.push(...cleared.resumedDealIds);
  }

  return {
    degradedIntegrationIds,
    recoveredIntegrationIds,
    syncFailurePausedDealIds,
    disconnectedPausedDealIds,
    resumedDealIds,
    notificationsSent,
  };
}
