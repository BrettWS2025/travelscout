"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import type {
  BookingDestinationType,
  ConversionTrackingMethod,
  SyncMode,
  SyncType,
} from "@/lib/marketplace/enums";
import type { SyncLogStatus } from "@/lib/marketplace/integration";
import {
  IntegrationsApiError,
  connectIntegrationApi,
  disconnectIntegrationApi,
  getDisconnectPreviewApi,
  getIntegrationDetailApi,
  listIntegrationProductsApi,
  listSyncLogsApi,
  patchIntegrationSettingsApi,
  refreshIntegrationProductsApi,
  resyncIntegrationApi,
  setIntegrationProductEnabledApi,
  testIntegrationApi,
  testIntegrationBookingLinkApi,
  type IntegrationProductRow,
  type PublicIntegrationRow,
  type SyncLogRow,
} from "@/lib/marketplace/integrations-client";
import {
  BOOKING_DESTINATION_LABELS,
  CONVERSION_TRACKING_LABELS,
  INTEGRATION_STATUS_LABELS,
  SYNC_LOG_STATUS_LABELS,
  SYNC_MODE_LABELS,
  SYNC_TYPE_LABELS,
  bookingDestinationOptions,
  canManageIntegrations,
  conversionTrackingOptions,
  formatPollInterval,
  formatSyncTime,
  integrationErrorFixText,
  integrationsListHref,
  pollIntervalOptions,
  providerLabel,
  syncModeOptions,
  syncStatusFilterOptions,
  syncTypeFilterOptions,
} from "@/lib/marketplace/integrations-settings-ui";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

type Props = {
  provider: string;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
      <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
        {title}
      </h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]">
      {children}
    </label>
  );
}

function formatMinor(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return "—";
  const cur = currency ?? "NZD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: cur,
    }).format(n / 100);
  if (min != null && max != null && min !== max) {
    return `${fmt(min)} – ${fmt(max)}`;
  }
  return fmt(min ?? max ?? 0);
}

export function IntegrationDetail({ provider }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const label = providerLabel(provider);

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [integration, setIntegration] = useState<PublicIntegrationRow | null>(
    null
  );
  const [cardStatus, setCardStatus] = useState<string>("not_connected");
  const [available, setAvailable] = useState(true);
  const [capabilities, setCapabilities] = useState<{
    min_poll_seconds: number;
    max_poll_seconds: number;
    webhooks_availability: boolean;
    preferred_sync_mode?: SyncMode;
  } | null>(null);

  const [products, setProducts] = useState<IntegrationProductRow[]>([]);
  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [logStatus, setLogStatus] = useState<SyncLogStatus | "">("");
  const [logType, setLogType] = useState<SyncType | "">("");

  const [apiKey, setApiKey] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("hybrid");
  const [pollInterval, setPollInterval] = useState(300);
  const [bookingDest, setBookingDest] =
    useState<BookingDestinationType>("provider_booking_page");
  const [bookingUrl, setBookingUrl] = useState("");
  const [conversionMethod, setConversionMethod] =
    useState<ConversionTrackingMethod>("none");
  const [bookingSourceLabel, setBookingSourceLabel] = useState("");
  const [autoEnable, setAutoEnable] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [disconnectCount, setDisconnectCount] = useState<number | null>(null);

  const canManage = canManageIntegrations(operator?.role);
  const connected =
    integration != null &&
    integration.status !== "disconnected" &&
    integration.status !== "not_connected";
  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

  const pollOptions = useMemo(
    () =>
      pollIntervalOptions(
        capabilities?.min_poll_seconds ?? 60,
        capabilities?.max_poll_seconds ?? 3600
      ),
    [capabilities]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { operators } = await listMyOperators(token);
        if (cancelled) return;
        setOperator(operators[0] ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load operator"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!operator || !canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const detail = await getIntegrationDetailApi(
          operator.id,
          provider,
          token
        );
        if (cancelled) return;
        setCardStatus(detail.card.status);
        setAvailable(detail.card.available);
        setCapabilities(detail.card.capabilities);
        setIntegration(detail.integration);
        if (detail.integration) {
          const row = detail.integration;
          setSyncMode((row.sync_mode as SyncMode) || "hybrid");
          setPollInterval(row.poll_interval_seconds ?? 300);
          setBookingDest(
            (row.default_booking_destination_type as BookingDestinationType) ||
              "provider_booking_page"
          );
          setBookingUrl(row.booking_base_url ?? "");
          setConversionMethod(
            (row.conversion_tracking_method as ConversionTrackingMethod) ||
              "none"
          );
          setBookingSourceLabel(row.booking_source_label ?? "");
          setAutoEnable(row.auto_enable_new_products === true);
        }

        if (
          detail.integration &&
          detail.integration.status !== "disconnected"
        ) {
          const [prodRes, logRes, preview] = await Promise.all([
            listIntegrationProductsApi(operator.id, provider, token).catch(
              () => ({ products: [] as IntegrationProductRow[] })
            ),
            listSyncLogsApi(operator.id, provider, {}, token).catch(() => ({
              sync_logs: [] as SyncLogRow[],
            })),
            getDisconnectPreviewApi(operator.id, provider, token).catch(
              () => null
            ),
          ]);
          if (cancelled) return;
          setProducts(prodRes.products);
          setLogs(logRes.sync_logs);
          setDisconnectCount(preview?.deals_to_pause ?? null);
        } else {
          setProducts([]);
          setLogs([]);
          setDisconnectCount(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof IntegrationsApiError
              ? err.message
              : "Failed to load integration"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operator, provider, token, reloadKey, canManage]);

  useEffect(() => {
    if (!operator || !connected || !canManage) return;
    let cancelled = false;
    (async () => {
      try {
        const { sync_logs } = await listSyncLogsApi(
          operator.id,
          provider,
          { status: logStatus, sync_type: logType },
          token
        );
        if (!cancelled) setLogs(sync_logs);
      } catch {
        // keep existing logs
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    operator,
    provider,
    token,
    connected,
    canManage,
    logStatus,
    logType,
    reloadKey,
  ]);

  async function runAction(
    fn: () => Promise<void>,
    successMessage: string
  ) {
    if (!operator || !canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(successMessage);
      bumpReload();
    } catch (err) {
      setError(
        err instanceof IntegrationsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Action failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConnect() {
    const key = apiKey.trim();
    if (!key) {
      setError("Paste your Rezdy API key to connect.");
      return;
    }
    await runAction(async () => {
      await connectIntegrationApi(
        operator!.id,
        provider,
        { api_key: key },
        token
      );
      setApiKey("");
    }, `${label} connected. Sync started.`);
  }

  async function onTestConnection() {
    await runAction(async () => {
      const result = await testIntegrationApi(operator!.id, provider, token);
      if (!result.ok) {
        throw new IntegrationsApiError(
          result.error || "Connection test failed",
          400
        );
      }
    }, "Connection OK.");
  }

  async function onDisconnect() {
    const count = disconnectCount ?? 0;
    const ok = window.confirm(
      count > 0
        ? `Disconnect ${label}? ${count} live or scheduled deal${count === 1 ? "" : "s"} will be auto-paused.`
        : `Disconnect ${label}? You can reconnect later.`
    );
    if (!ok) return;
    await runAction(async () => {
      await disconnectIntegrationApi(operator!.id, provider, token);
    }, `${label} disconnected.`);
  }

  async function onSaveSettings(patch: Parameters<typeof patchIntegrationSettingsApi>[2]) {
    await runAction(async () => {
      await patchIntegrationSettingsApi(
        operator!.id,
        provider,
        patch,
        token
      );
    }, "Settings saved.");
  }

  async function onToggleProduct(product: IntegrationProductRow, enabled: boolean) {
    await runAction(async () => {
      await setIntegrationProductEnabledApi(
        operator!.id,
        provider,
        product.id,
        enabled,
        token
      );
    }, enabled ? `Enabled “${product.name}”.` : `Disabled “${product.name}”.`);
  }

  async function onRefreshProducts() {
    await runAction(async () => {
      await refreshIntegrationProductsApi(operator!.id, provider, token);
    }, "Products refreshed.");
  }

  async function onResync() {
    await runAction(async () => {
      await resyncIntegrationApi(operator!.id, provider, token);
    }, "Sync finished.");
  }

  async function onTestBookingLink() {
    await runAction(async () => {
      const result = await testIntegrationBookingLinkApi(
        operator!.id,
        provider,
        bookingUrl || null,
        token
      );
      if (!result.ok) {
        throw new IntegrationsApiError(
          result.error ||
            `Link check failed${result.status != null ? ` (${result.status})` : ""}`,
          400
        );
      }
      if (typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    }, "Booking link is reachable.");
  }

  const statusLabel =
    INTEGRATION_STATUS_LABELS[
      (integration?.status ?? cardStatus) as keyof typeof INTEGRATION_STATUS_LABELS
    ] ?? cardStatus;

  const fixText = integration
    ? integrationErrorFixText(
        integration.last_error_code,
        integration.last_error_message,
        label
      )
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
            <Link
              href={integrationsListHref()}
              className="hover:text-[var(--ts-teal)]"
            >
              Integrations
            </Link>
            {" / "}
            {label}
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            {label}
          </h2>
          {operator ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {operator.tradingName} · {statusLabel}
            </p>
          ) : null}
        </div>
        <Link
          href={integrationsListHref()}
          className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
        >
          All integrations
        </Link>
      </div>

      <SettingsSubnav />

      {message ? (
        <p className="rounded-xl border border-[var(--ts-teal)]/20 bg-[var(--ts-teal)]/5 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading…
        </p>
      ) : !operator ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          No operator membership found.
        </p>
      ) : !canManage ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Integrations require owner or manager access.
        </p>
      ) : !available ? (
        <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/60 px-6 py-10 text-center">
          <p className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
            {label} is coming soon
          </p>
          <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Connect Rezdy today; we&apos;ll add {label} through the same
            provider adapter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Connection">
            {!connected ? (
              <>
                <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                  In {label}: Integrations → API → Request API Key, then paste
                  it here. We store it encrypted and never show it again.
                </p>
                <FieldLabel>API key</FieldLabel>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={busy}
                  className="w-full max-w-md rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
                  placeholder="Paste API key"
                />
                <button
                  type="button"
                  disabled={busy || !apiKey.trim()}
                  onClick={() => void onConnect()}
                  className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Connecting…" : "Connect"}
                </button>
              </>
            ) : (
              <>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Account
                    </dt>
                    <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      {integration?.external_account_name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Connected
                    </dt>
                    <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      {formatSyncTime(
                        integration?.connected_at,
                        operator.timezone
                      )}
                      {integration?.connected_by
                        ? ` · by ${integration.connected_by.slice(0, 8)}…`
                        : ""}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onTestConnection()}
                    className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] disabled:opacity-60"
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDisconnect()}
                    className="rounded-xl border border-red-200 px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-red-700 disabled:opacity-60"
                  >
                    Disconnect
                    {disconnectCount != null && disconnectCount > 0
                      ? ` (${disconnectCount} deals)`
                      : ""}
                  </button>
                </div>
              </>
            )}
          </Section>

          {connected && integration ? (
            <>
              <Section title="Health">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Status
                    </dt>
                    <dd className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                      {statusLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Last successful sync
                    </dt>
                    <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      {formatSyncTime(
                        integration.last_successful_sync_at,
                        operator.timezone
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Last Instant Update Received
                    </dt>
                    <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      {formatSyncTime(
                        integration.webhook_last_received_at,
                        operator.timezone
                      )}
                    </dd>
                  </div>
                </dl>
                {fixText ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-amber-950">
                    {fixText}
                  </p>
                ) : (
                  <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                    No current errors.
                  </p>
                )}
              </Section>

              <Section title="Products">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                    <input
                      type="checkbox"
                      checked={autoEnable}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setAutoEnable(next);
                        void onSaveSettings({
                          auto_enable_new_products: next,
                        });
                      }}
                    />
                    Auto-enable new products for deals
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRefreshProducts()}
                    className="rounded-xl border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
                {products.length === 0 ? (
                  <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                    No products synced yet. Connect and wait for the first sync,
                    or click Refresh.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left font-[family-name:var(--font-sora)] text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ts-ink)]/10 text-xs text-[var(--ts-muted)]">
                          <th className="py-2 pr-3 font-semibold">Product</th>
                          <th className="py-2 pr-3 font-semibold">Price</th>
                          <th className="py-2 pr-3 font-semibold">
                            Sessions (72h)
                          </th>
                          <th className="py-2 pr-3 font-semibold">Enabled</th>
                          <th className="py-2 font-semibold">Last synced</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-[var(--ts-ink)]/5"
                          >
                            <td className="py-2.5 pr-3 font-medium text-[var(--ts-ink)]">
                              {p.name}
                              {p.archived_in_provider ? (
                                <span className="ml-2 text-xs text-amber-800">
                                  Archived
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--ts-muted)]">
                              {formatMinor(
                                p.price_min_minor,
                                p.price_max_minor,
                                p.currency
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--ts-muted)]">
                              {p.sessions_next_72h}
                            </td>
                            <td className="py-2.5 pr-3">
                              <input
                                type="checkbox"
                                checked={p.is_enabled_for_deals}
                                disabled={busy || p.archived_in_provider}
                                aria-label={`Enable ${p.name} for deals`}
                                onChange={(e) =>
                                  void onToggleProduct(p, e.target.checked)
                                }
                              />
                            </td>
                            <td className="py-2.5 text-[var(--ts-muted)]">
                              {formatSyncTime(
                                p.last_synced_at,
                                operator.timezone
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title="Sync">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Sync mode</FieldLabel>
                    <select
                      value={syncMode}
                      disabled={busy}
                      onChange={(e) =>
                        setSyncMode(e.target.value as SyncMode)
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {syncModeOptions(capabilities).map((m) => (
                        <option key={m} value={m}>
                          {SYNC_MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>
                      Poll interval (allowed{" "}
                      {formatPollInterval(capabilities?.min_poll_seconds)}–
                      {formatPollInterval(capabilities?.max_poll_seconds)})
                    </FieldLabel>
                    <select
                      value={pollInterval}
                      disabled={busy}
                      onChange={(e) =>
                        setPollInterval(Number(e.target.value))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {pollOptions.map((s) => (
                        <option key={s} value={s}>
                          {formatPollInterval(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onSaveSettings({
                        sync_mode: syncMode,
                        poll_interval_seconds: pollInterval,
                      })
                    }
                    className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Save sync settings
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onResync()}
                    className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Sync Again
                  </button>
                </div>
              </Section>

              <Section title="Booking links">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Default destination</FieldLabel>
                    <select
                      value={bookingDest}
                      disabled={busy}
                      onChange={(e) =>
                        setBookingDest(
                          e.target.value as BookingDestinationType
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {bookingDestinationOptions().map((d) => (
                        <option key={d} value={d}>
                          {BOOKING_DESTINATION_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Booking base URL (https)</FieldLabel>
                    <input
                      type="url"
                      value={bookingUrl}
                      disabled={busy}
                      onChange={(e) => setBookingUrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                      placeholder="https://your-alias.rezdy.com"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onSaveSettings({
                        default_booking_destination_type: bookingDest,
                        booking_base_url: bookingUrl || null,
                      })
                    }
                    className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Save booking links
                  </button>
                  <button
                    type="button"
                    disabled={busy || !bookingUrl.trim()}
                    onClick={() => void onTestBookingLink()}
                    className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Test link
                  </button>
                </div>
              </Section>

              <Section title="Conversion tracking">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Method</FieldLabel>
                    <select
                      value={conversionMethod}
                      disabled={busy}
                      onChange={(e) =>
                        setConversionMethod(
                          e.target.value as ConversionTrackingMethod
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {conversionTrackingOptions().map((m) => (
                        <option key={m} value={m}>
                          {CONVERSION_TRACKING_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Booking source label</FieldLabel>
                    <input
                      type="text"
                      maxLength={80}
                      value={bookingSourceLabel}
                      disabled={busy}
                      onChange={(e) => setBookingSourceLabel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onSaveSettings({
                      conversion_tracking_method: conversionMethod,
                      booking_source_label: bookingSourceLabel || null,
                    })
                  }
                  className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  Save conversion tracking
                </button>
              </Section>

              <Section title="Sync log">
                <div className="flex flex-wrap gap-3">
                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <select
                      value={logStatus}
                      onChange={(e) =>
                        setLogStatus(e.target.value as SyncLogStatus | "")
                      }
                      className="mt-1 rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {syncStatusFilterOptions().map((s) => (
                        <option key={s || "all"} value={s}>
                          {s ? SYNC_LOG_STATUS_LABELS[s] : "All"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <select
                      value={logType}
                      onChange={(e) =>
                        setLogType(e.target.value as SyncType | "")
                      }
                      className="mt-1 rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                    >
                      {syncTypeFilterOptions().map((t) => (
                        <option key={t || "all"} value={t}>
                          {t ? SYNC_TYPE_LABELS[t] : "All"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {logs.length === 0 ? (
                  <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                    No sync log entries yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--ts-ink)]/10 rounded-xl border border-[var(--ts-ink)]/10">
                    {logs.map((log) => (
                      <li
                        key={log.id}
                        className="px-4 py-3 font-[family-name:var(--font-sora)] text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--ts-ink)]">
                            {SYNC_TYPE_LABELS[log.sync_type] ?? log.sync_type} ·{" "}
                            {SYNC_LOG_STATUS_LABELS[log.status] ?? log.status}
                          </span>
                          <span className="text-xs text-[var(--ts-muted)]">
                            {formatSyncTime(log.started_at, operator.timezone)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--ts-muted)]">
                          {log.items_processed} items
                          {log.affected_deals && log.affected_deals.length > 0
                            ? ` · ${log.affected_deals.length} deals`
                            : ""}
                        </p>
                        {log.error_message_readable || log.error_message ? (
                          <p className="mt-1 text-xs text-red-700">
                            {log.error_message_readable || log.error_message}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
