/**
 * Connect / test / disconnect / settings for operator integrations (Chunk 27).
 *
 * All provider I/O goes through ProviderAdapter. Credentials only via
 * credentials_ref (secrets helper). Status changes and deal auto-pauses go
 * through applyAutoPause / clearAutoPause.
 *
 * Full product/session sync is Chunk 28 (`runSync` in integration-sync.ts).
 * Connect kicks off a full sync via kickOffFullSync after credentials are stored.
 */

import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  applyAutoPause,
  type DealActor,
} from "./deal-status";
import {
  assertNoSecretRefs,
  serializeIntegration,
  type Integration,
  type PublicIntegration,
  type SyncLog,
} from "./integration";
import {
  isBookingDestinationType,
  isConversionTrackingMethod,
  isIntegrationProvider,
  isSyncMode,
  type BookingDestinationType,
  type ConversionTrackingMethod,
  type IntegrationProvider,
  type SyncMode,
} from "./enums";
import {
  AdapterNotImplementedError,
  AdapterOperationError,
  UnknownProviderError,
  getAdapter,
  isProviderAvailable,
  listRegisteredProviders,
  type ProviderCapabilities,
} from "./providers";
import {
  allowsDevSecretFallback,
  configureSecrets,
  createMemorySecretBackend,
  createSecretsHelper,
  deleteSecret,
  resetSecretsConfig,
} from "./secrets";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IntegrationConnectError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "IntegrationConnectError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Secrets bootstrap (dev / test / HTTP store)
// ---------------------------------------------------------------------------

/** Fixed AES key for local/test only — never used when NODE_ENV=production. */
const DEV_TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let secretsBootstrapped = false;

/**
 * Ensure storeSecret/readSecret/deleteSecret work for connect flows.
 * Uses SECRETS_ENCRYPTION_KEY when set; otherwise a fixed key in
 * development/test only (never production without an env key).
 * Security S11: production missing key → 503, no DEV_TEST_KEY_HEX.
 */
export function ensureIntegrationSecretsConfigured(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (secretsBootstrapped) return;
  const hasKey = Boolean(env.SECRETS_ENCRYPTION_KEY?.trim());
  if (!hasKey && !allowsDevSecretFallback(env)) {
    throw new IntegrationConnectError(
      "SECRETS_ENCRYPTION_KEY is required to connect integrations",
      503,
      "secrets_not_configured"
    );
  }
  const helper = createSecretsHelper({
    backend: createMemorySecretBackend(),
    env: hasKey
      ? env
      : { ...env, SECRETS_ENCRYPTION_KEY: DEV_TEST_KEY_HEX },
  });
  configureSecrets(helper);
  secretsBootstrapped = true;
}

/** Test helper — clears the module-level secrets bootstrap flag. */
export function resetIntegrationSecretsBootstrap(): void {
  secretsBootstrapped = false;
  resetSecretsConfig();
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

function listOperatorIntegrations(
  store: DealDraftStore,
  operatorId: string
): Integration[] {
  const map = ensureIntegrationsMap(store);
  return [...map.values()].filter((i) => i.operatorId === operatorId);
}

/**
 * Active = any status except disconnected. Unique (operator, provider) among
 * active rows is enforced by connect.
 */
export function findActiveIntegration(
  store: DealDraftStore,
  operatorId: string,
  provider: IntegrationProvider
): Integration | null {
  return (
    listOperatorIntegrations(store, operatorId).find(
      (i) => i.provider === provider && i.status !== "disconnected"
    ) ?? null
  );
}

function findReconnectableIntegration(
  store: DealDraftStore,
  operatorId: string,
  provider: IntegrationProvider
): Integration | null {
  const active = findActiveIntegration(store, operatorId, provider);
  if (active) return active;
  const disconnected = listOperatorIntegrations(store, operatorId)
    .filter((i) => i.provider === provider && i.status === "disconnected")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return disconnected[0] ?? null;
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

/** Live or scheduled deals that will be auto-paused on disconnect. */
export function countDealsPausedOnDisconnect(
  store: DealDraftStore,
  integrationId: string
): number {
  return dealsForIntegration(store, integrationId).filter(
    (d) => d.status === "live" || d.status === "scheduled"
  ).length;
}

// ---------------------------------------------------------------------------
// Public card / serialize
// ---------------------------------------------------------------------------

export type IntegrationProviderCard = {
  provider: IntegrationProvider;
  available: boolean;
  status: Integration["status"] | "not_connected";
  account_name: string | null;
  last_successful_sync_at: string | null;
  integration_id: string | null;
  connected_at: string | null;
  connected_by: string | null;
  last_error_message: string | null;
  capabilities: ProviderCapabilities | null;
};

function emptyCard(
  provider: IntegrationProvider,
  available: boolean
): IntegrationProviderCard {
  let capabilities: ProviderCapabilities | null = null;
  try {
    capabilities = getAdapter(provider).capabilities();
  } catch {
    capabilities = null;
  }
  return {
    provider,
    available,
    status: "not_connected",
    account_name: null,
    last_successful_sync_at: null,
    integration_id: null,
    connected_at: null,
    connected_by: null,
    last_error_message: null,
    capabilities,
  };
}

export function listIntegrationCards(
  store: DealDraftStore,
  operatorId: string
): IntegrationProviderCard[] {
  const cards: IntegrationProviderCard[] = [];
  for (const provider of listRegisteredProviders()) {
    const available = isProviderAvailable(provider);
    const active = findActiveIntegration(store, operatorId, provider);
    if (!active) {
      cards.push(emptyCard(provider, available));
      continue;
    }
    let capabilities: ProviderCapabilities | null = null;
    try {
      capabilities = getAdapter(provider).capabilities();
    } catch {
      capabilities = null;
    }
    cards.push({
      provider,
      available,
      status: active.status,
      account_name: active.externalAccountName,
      last_successful_sync_at: active.lastSuccessfulSyncAt,
      integration_id: active.id,
      connected_at: active.connectedAt,
      connected_by: active.connectedBy,
      last_error_message: active.lastErrorMessage,
      capabilities,
    });
  }
  return cards;
}

export type IntegrationDetailResult = {
  card: IntegrationProviderCard;
  /** Full public integration when actively connected (any non-disconnected row). */
  integration: Record<string, unknown> | null;
};

/**
 * Provider detail payload for Settings (Chunk 37). Always returns a card;
 * `integration` is null when not connected / only disconnected history.
 */
export function getIntegrationDetail(
  store: DealDraftStore,
  operatorId: string,
  provider: string
): IntegrationDetailResult {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const cards = listIntegrationCards(store, operatorId);
  const card =
    cards.find((c) => c.provider === provider) ??
    emptyCard(provider, isProviderAvailable(provider));
  const active = findActiveIntegration(store, operatorId, provider);
  return {
    card,
    integration: active ? serializeIntegrationPublic(active) : null,
  };
}

/** Snake_case public integration for API detail responses. */
export function serializeIntegrationPublic(
  integration: Integration
): Record<string, unknown> {
  const safe = serializeIntegration(integration);
  const out: Record<string, unknown> = {
    id: safe.id,
    operator_id: safe.operatorId,
    provider: safe.provider,
    status: safe.status,
    auth_type: safe.authType,
    external_account_id: safe.externalAccountId,
    external_account_name: safe.externalAccountName,
    sync_mode: safe.syncMode,
    poll_interval_seconds: safe.pollIntervalSeconds,
    webhook_last_received_at: safe.webhookLastReceivedAt,
    last_sync_at: safe.lastSyncAt,
    last_successful_sync_at: safe.lastSuccessfulSyncAt,
    last_error_code: safe.lastErrorCode,
    last_error_message: safe.lastErrorMessage,
    default_booking_destination_type: safe.defaultBookingDestinationType,
    booking_base_url: safe.bookingBaseUrl,
    conversion_tracking_method: safe.conversionTrackingMethod,
    booking_source_label: safe.bookingSourceLabel,
    auto_enable_new_products: safe.autoEnableNewProducts,
    connected_at: safe.connectedAt,
    connected_by: safe.connectedBy,
    created_at: safe.createdAt,
    updated_at: safe.updatedAt,
  };
  assertNoSecretRefs(out);
  return out;
}

export function serializeSyncLog(log: SyncLog): Record<string, unknown> {
  return {
    id: log.id,
    integration_id: log.integrationId,
    sync_type: log.syncType,
    status: log.status,
    started_at: log.startedAt,
    finished_at: log.finishedAt,
    items_processed: log.itemsProcessed,
    error_code: log.errorCode,
    error_message: log.errorMessage,
    affected_deal_ids: log.affectedDealIds,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Sync kickoff (delegates to Chunk 28 runSync — dynamic import avoids cycles)
// ---------------------------------------------------------------------------

export type KickOffFullSyncResult = {
  sync_log: SyncLog;
  integration: Integration;
  resumed_deal_ids: string[];
};

/**
 * Start a full sync after connect/reconnect. Upserts products/sessions via
 * `runSync` and clears `integration_disconnected` auto-pauses on success.
 */
export async function kickOffFullSync(
  store: DealDraftStore,
  integrationId: string,
  options?: { now?: string; actor?: DealActor }
): Promise<KickOffFullSyncResult> {
  const { runSync } = await import("./integration-sync");
  const result = await runSync(store, integrationId, "full", {
    now: options?.now,
    actor: options?.actor,
    clearDisconnectedPauses: true,
  });
  return {
    sync_log: result.sync_log,
    integration: result.integration,
    resumed_deal_ids: result.resumed_deal_ids,
  };
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

function defaultSyncMode(caps: ProviderCapabilities): SyncMode {
  if (caps.preferred_sync_mode) return caps.preferred_sync_mode;
  return caps.webhooks_availability ? "hybrid" : "polling";
}

function defaultPollInterval(caps: ProviderCapabilities): number {
  const preferred = Math.max(caps.min_poll_seconds, 300);
  return Math.min(preferred, caps.max_poll_seconds);
}

function clampPollInterval(
  seconds: number,
  caps: ProviderCapabilities
): number {
  return Math.min(
    Math.max(Math.floor(seconds), caps.min_poll_seconds),
    caps.max_poll_seconds
  );
}

function readableConnectError(err: unknown): string {
  if (err instanceof AdapterNotImplementedError) {
    return `${err.provider} is coming soon and cannot be connected yet.`;
  }
  if (err instanceof AdapterOperationError) {
    return err.message;
  }
  if (err instanceof UnknownProviderError) {
    return err.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Could not connect to the booking provider.";
}

export type ConnectIntegrationResult = {
  integration: Integration;
  public: Record<string, unknown>;
  sync_log: SyncLog;
  resumed_deal_ids: string[];
};

export async function connectIntegration(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  credentialsInput: Record<string, unknown>,
  options: {
    actor: DealActor;
    now?: string;
    authType?: Integration["authType"];
  }
): Promise<ConnectIntegrationResult> {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  if (!isProviderAvailable(provider)) {
    throw new IntegrationConnectError(
      `${provider} is coming soon and cannot be connected yet.`,
      400,
      "provider_unavailable"
    );
  }

  ensureIntegrationSecretsConfigured();
  const adapter = getAdapter(provider);
  const caps = adapter.capabilities();
  const now = options.now ?? new Date().toISOString();
  const actorId =
    options.actor.type === "user" || options.actor.type === "admin"
      ? options.actor.id ?? null
      : null;

  let row =
    findReconnectableIntegration(store, operatorId, provider) ??
    ({
      id: crypto.randomUUID(),
      operatorId,
      provider,
      status: "not_connected",
      authType: null,
      credentialsRef: null,
      webhookSecretRef: null,
      externalAccountId: null,
      externalAccountName: null,
      syncMode: null,
      pollIntervalSeconds: null,
      webhookLastReceivedAt: null,
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      defaultBookingDestinationType: null,
      bookingBaseUrl: null,
      conversionTrackingMethod: "none",
      bookingSourceLabel: null,
      autoEnableNewProducts: false,
      connectedAt: null,
      connectedBy: null,
      createdAt: now,
      updatedAt: now,
    } satisfies Integration);

  // Delete previous credentials on reconnect so we never leave orphan secrets.
  const previousRef = row.credentialsRef;

  row = {
    ...row,
    status: "connecting",
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: now,
  };
  saveIntegration(store, row);

  try {
    const connected = await adapter.connect(credentialsInput);
    if (previousRef && previousRef !== connected.credentials_ref) {
      try {
        await deleteSecret(previousRef);
      } catch {
        // Best-effort cleanup
      }
    }

    row = {
      ...row,
      status: "connected",
      authType: options.authType ?? "api_key",
      credentialsRef: connected.credentials_ref,
      webhookSecretRef:
        connected.webhook_secret_ref ?? row.webhookSecretRef ?? null,
      externalAccountId: connected.external_account_id,
      externalAccountName: connected.external_account_name,
      bookingBaseUrl:
        row.bookingBaseUrl ??
        connected.booking_base_url ??
        null,
      syncMode: row.syncMode ?? defaultSyncMode(caps),
      pollIntervalSeconds:
        row.pollIntervalSeconds != null
          ? clampPollInterval(row.pollIntervalSeconds, caps)
          : defaultPollInterval(caps),
      connectedAt: now,
      connectedBy: actorId,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: now,
    };
    saveIntegration(store, row);

    const sync = await kickOffFullSync(store, row.id, {
      now,
      actor: options.actor,
    });

    return {
      integration: sync.integration,
      public: serializeIntegrationPublic(sync.integration),
      sync_log: sync.sync_log,
      resumed_deal_ids: sync.resumed_deal_ids,
    };
  } catch (err) {
    const message = readableConnectError(err);
    const code =
      err instanceof AdapterOperationError
        ? err.code
        : err instanceof AdapterNotImplementedError
          ? "not_implemented"
          : "connect_failed";
    row = {
      ...row,
      status: "error",
      lastErrorCode: code,
      lastErrorMessage: message,
      updatedAt: now,
    };
    saveIntegration(store, row);
    throw new IntegrationConnectError(message, 400, code);
  }
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testIntegrationConnection(
  store: DealDraftStore,
  operatorId: string,
  provider: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationConnectError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded" &&
    integration.status !== "error"
  ) {
    throw new IntegrationConnectError(
      `Cannot test connection while status is ${integration.status}.`,
      409,
      "invalid_status"
    );
  }
  if (!integration.credentialsRef) {
    throw new IntegrationConnectError(
      "Integration has no stored credentials.",
      400,
      "missing_credentials"
    );
  }

  ensureIntegrationSecretsConfigured();
  const adapter = getAdapter(provider);
  try {
    return await adapter.testConnection(integration);
  } catch (err) {
    return { ok: false, error: readableConnectError(err) };
  }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export function getDisconnectPreview(
  store: DealDraftStore,
  operatorId: string,
  provider: string
): {
  provider: IntegrationProvider;
  integration_id: string;
  deals_to_pause: number;
  account_name: string | null;
} {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationConnectError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }
  return {
    provider,
    integration_id: integration.id,
    deals_to_pause: countDealsPausedOnDisconnect(store, integration.id),
    account_name: integration.externalAccountName,
  };
}

export type DisconnectIntegrationResult = {
  integration: Integration;
  public: Record<string, unknown>;
  paused_deal_ids: string[];
};

export async function disconnectIntegration(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  options: {
    confirm: boolean;
    actor: DealActor;
    now?: string;
  }
): Promise<DisconnectIntegrationResult> {
  if (!options.confirm) {
    throw new IntegrationConnectError(
      "Disconnect requires confirm: true. Call disconnect-preview first.",
      400,
      "confirm_required"
    );
  }
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }

  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationConnectError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }

  const now = options.now ?? new Date().toISOString();
  const pausedIds: string[] = [];

  for (const deal of dealsForIntegration(store, integration.id)) {
    if (deal.status === "live" || deal.status === "scheduled") {
      applyAutoPause(
        store,
        deal.id,
        "integration_disconnected",
        `${provider} was disconnected`,
        { actor: options.actor, now }
      );
      pausedIds.push(deal.id);
    }
  }

  ensureIntegrationSecretsConfigured();
  if (integration.credentialsRef) {
    try {
      await deleteSecret(integration.credentialsRef);
    } catch {
      // Still mark disconnected even if secret delete fails
    }
  }
  if (integration.webhookSecretRef) {
    try {
      await deleteSecret(integration.webhookSecretRef);
    } catch {
      // ignore
    }
  }

  const updated: Integration = {
    ...integration,
    status: "disconnected",
    credentialsRef: null,
    webhookSecretRef: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: now,
  };
  saveIntegration(store, updated);

  return {
    integration: updated,
    public: serializeIntegrationPublic(updated),
    paused_deal_ids: pausedIds,
  };
}

// ---------------------------------------------------------------------------
// Settings PATCH
// ---------------------------------------------------------------------------

export type IntegrationSettingsPatch = {
  sync_mode?: SyncMode | null;
  poll_interval_seconds?: number | null;
  default_booking_destination_type?: BookingDestinationType | null;
  booking_base_url?: string | null;
  conversion_tracking_method?: ConversionTrackingMethod;
  booking_source_label?: string | null;
  auto_enable_new_products?: boolean;
};

function parseSettingsBody(
  body: Record<string, unknown>
): IntegrationSettingsPatch {
  const patch: IntegrationSettingsPatch = {};

  if ("sync_mode" in body || "syncMode" in body) {
    const raw = body.sync_mode ?? body.syncMode;
    if (raw === null) patch.sync_mode = null;
    else if (isSyncMode(raw)) patch.sync_mode = raw;
    else {
      throw new IntegrationConnectError("Invalid sync_mode", 400, "invalid_field");
    }
  }

  if ("poll_interval_seconds" in body || "pollIntervalSeconds" in body) {
    const raw = body.poll_interval_seconds ?? body.pollIntervalSeconds;
    if (raw === null) patch.poll_interval_seconds = null;
    else if (typeof raw === "number" && Number.isFinite(raw)) {
      patch.poll_interval_seconds = raw;
    } else {
      throw new IntegrationConnectError(
        "poll_interval_seconds must be a number",
        400,
        "invalid_field"
      );
    }
  }

  if (
    "default_booking_destination_type" in body ||
    "defaultBookingDestinationType" in body
  ) {
    const raw =
      body.default_booking_destination_type ??
      body.defaultBookingDestinationType;
    if (raw === null) patch.default_booking_destination_type = null;
    else if (isBookingDestinationType(raw)) {
      patch.default_booking_destination_type = raw;
    } else {
      throw new IntegrationConnectError(
        "Invalid default_booking_destination_type",
        400,
        "invalid_field"
      );
    }
  }

  if ("booking_base_url" in body || "bookingBaseUrl" in body) {
    const raw = body.booking_base_url ?? body.bookingBaseUrl;
    if (raw === null || raw === "") patch.booking_base_url = null;
    else if (typeof raw === "string") {
      if (!/^https:\/\//i.test(raw)) {
        throw new IntegrationConnectError(
          "booking_base_url must be https",
          400,
          "invalid_field"
        );
      }
      patch.booking_base_url = raw;
    } else {
      throw new IntegrationConnectError(
        "booking_base_url must be a string",
        400,
        "invalid_field"
      );
    }
  }

  if (
    "conversion_tracking_method" in body ||
    "conversionTrackingMethod" in body
  ) {
    const raw =
      body.conversion_tracking_method ?? body.conversionTrackingMethod;
    if (isConversionTrackingMethod(raw)) {
      patch.conversion_tracking_method = raw;
    } else {
      throw new IntegrationConnectError(
        "Invalid conversion_tracking_method",
        400,
        "invalid_field"
      );
    }
  }

  if ("booking_source_label" in body || "bookingSourceLabel" in body) {
    const raw = body.booking_source_label ?? body.bookingSourceLabel;
    if (raw === null || raw === "") patch.booking_source_label = null;
    else if (typeof raw === "string") {
      if (raw.length > 80) {
        throw new IntegrationConnectError(
          "booking_source_label max 80 characters",
          400,
          "invalid_field"
        );
      }
      patch.booking_source_label = raw;
    } else {
      throw new IntegrationConnectError(
        "booking_source_label must be a string",
        400,
        "invalid_field"
      );
    }
  }

  if (
    "auto_enable_new_products" in body ||
    "autoEnableNewProducts" in body
  ) {
    const raw = body.auto_enable_new_products ?? body.autoEnableNewProducts;
    if (typeof raw === "boolean") patch.auto_enable_new_products = raw;
    else {
      throw new IntegrationConnectError(
        "auto_enable_new_products must be a boolean",
        400,
        "invalid_field"
      );
    }
  }

  return patch;
}

export function updateIntegrationSettings(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  body: Record<string, unknown>,
  options?: { now?: string }
): { integration: Integration; public: Record<string, unknown> } {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationConnectError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded"
  ) {
    throw new IntegrationConnectError(
      `Cannot update settings while status is ${integration.status}.`,
      409,
      "invalid_status"
    );
  }

  const patch = parseSettingsBody(body);
  const caps = getAdapter(provider).capabilities();
  const now = options?.now ?? new Date().toISOString();

  let poll = integration.pollIntervalSeconds;
  if (patch.poll_interval_seconds !== undefined) {
    if (patch.poll_interval_seconds === null) {
      poll = defaultPollInterval(caps);
    } else {
      poll = clampPollInterval(patch.poll_interval_seconds, caps);
    }
  }

  const updated: Integration = {
    ...integration,
    syncMode:
      patch.sync_mode !== undefined
        ? patch.sync_mode
        : integration.syncMode,
    pollIntervalSeconds: poll,
    defaultBookingDestinationType:
      patch.default_booking_destination_type !== undefined
        ? patch.default_booking_destination_type
        : integration.defaultBookingDestinationType,
    bookingBaseUrl:
      patch.booking_base_url !== undefined
        ? patch.booking_base_url
        : integration.bookingBaseUrl,
    conversionTrackingMethod:
      patch.conversion_tracking_method !== undefined
        ? patch.conversion_tracking_method
        : integration.conversionTrackingMethod,
    bookingSourceLabel:
      patch.booking_source_label !== undefined
        ? patch.booking_source_label
        : integration.bookingSourceLabel,
    autoEnableNewProducts:
      patch.auto_enable_new_products !== undefined
        ? patch.auto_enable_new_products
        : integration.autoEnableNewProducts,
    updatedAt: now,
  };
  saveIntegration(store, updated);
  return {
    integration: updated,
    public: serializeIntegrationPublic(updated),
  };
}

// ---------------------------------------------------------------------------
// Test booking base URL (Chunk 37 settings UI)
// ---------------------------------------------------------------------------

export type TestBookingLinkResult = {
  ok: boolean;
  url: string;
  status: number | null;
  error: string | null;
};

/**
 * Reachability check for the integration's booking_base_url (Settings →
 * Booking links → Test link). Uses checkLink; does not mutate deal link_*.
 */
export async function testIntegrationBookingLink(
  store: DealDraftStore,
  operatorId: string,
  provider: string,
  options?: { url?: string | null; fetchFn?: typeof fetch }
): Promise<TestBookingLinkResult> {
  if (!isIntegrationProvider(provider)) {
    throw new IntegrationConnectError(
      `Unknown provider: ${provider}`,
      400,
      "unknown_provider"
    );
  }
  const integration = findActiveIntegration(store, operatorId, provider);
  if (!integration) {
    throw new IntegrationConnectError(
      "Integration is not connected.",
      404,
      "not_connected"
    );
  }

  const url =
    (typeof options?.url === "string" && options.url.trim()
      ? options.url.trim()
      : null) ?? integration.bookingBaseUrl;

  if (!url) {
    throw new IntegrationConnectError(
      "No booking base URL to test. Save a https booking base URL first.",
      400,
      "missing_booking_url"
    );
  }
  if (!/^https:\/\//i.test(url)) {
    throw new IntegrationConnectError(
      "booking_base_url must be https",
      400,
      "invalid_field"
    );
  }

  const { checkLink } = await import("./booking-link");
  const result = await checkLink(url, { fetchFn: options?.fetchFn });
  return {
    ok: result.ok,
    url,
    status: result.status,
    error: result.error,
  };
}

// Re-export for callers that need the camel PublicIntegration type
export type { PublicIntegration };
