"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  IntegrationsApiError,
  listIntegrationsApi,
  type IntegrationProviderCard,
} from "@/lib/marketplace/integrations-client";
import {
  INTEGRATION_STATUS_LABELS,
  canManageIntegrations,
  formatSyncTime,
  providerDetailHref,
  providerLabel,
  showManualOperatorExplainer,
} from "@/lib/marketplace/integrations-settings-ui";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

export function IntegrationsGrid() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [cards, setCards] = useState<IntegrationProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canManage = canManageIntegrations(operator?.role);
  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

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
    if (!operator) {
      setLoading(false);
      return;
    }
    if (!canManage) {
      setLoading(false);
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { integrations } = await listIntegrationsApi(operator.id, token);
        if (cancelled) return;
        setCards(integrations);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof IntegrationsApiError
              ? err.message
              : "Failed to load integrations"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operator, token, reloadKey, canManage]);

  const showExplainer = showManualOperatorExplainer(cards);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            Settings
          </h2>
          {operator ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {operator.tradingName}
              {!canManage ? " · integrations require owner or manager" : ""}
            </p>
          ) : null}
        </div>
        {canManage && cards.length > 0 ? (
          <button
            type="button"
            onClick={bumpReload}
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
          >
            Refresh
          </button>
        ) : null}
      </div>

      <SettingsSubnav />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading integrations…
        </p>
      ) : !operator ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          No operator membership found.
        </p>
      ) : !canManage ? (
        <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/60 px-6 py-10 text-center">
          <p className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
            Integrations are for owners and managers
          </p>
          <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Ask an owner or manager to connect Rezdy or other booking systems.
          </p>
        </div>
      ) : (
        <>
          {showExplainer ? (
            <div className="rounded-2xl border border-[var(--ts-teal)]/20 bg-[var(--ts-teal)]/5 px-5 py-4">
              <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                List deals without a booking system
              </p>
              <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                Manual deals work today with seat attestation and review.
                Connecting Rezdy unlocks live availability, automatic pauses when
                inventory changes, and Book now redirects to your provider page.
              </p>
            </div>
          ) : null}

          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((card) => {
              const label = providerLabel(card.provider);
              const statusLabel =
                INTEGRATION_STATUS_LABELS[
                  card.status as keyof typeof INTEGRATION_STATUS_LABELS
                ] ?? card.status;
              const comingSoon = !card.available;
              return (
                <li key={card.provider}>
                  <Link
                    href={
                      comingSoon
                        ? "#"
                        : providerDetailHref(card.provider)
                    }
                    aria-disabled={comingSoon}
                    onClick={(e) => {
                      if (comingSoon) e.preventDefault();
                    }}
                    className={`block rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5 transition ${
                      comingSoon
                        ? "cursor-not-allowed opacity-70"
                        : "hover:border-[var(--ts-teal)]/40 hover:shadow-[0_12px_30px_rgba(16,36,28,0.06)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-[family-name:var(--font-sora)] text-base font-semibold text-[var(--ts-ink)]">
                          {label}
                        </p>
                        <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                          {comingSoon
                            ? "Coming soon"
                            : statusLabel}
                        </p>
                      </div>
                      {!comingSoon ? (
                        <span
                          className={`shrink-0 rounded-lg px-2 py-1 font-[family-name:var(--font-sora)] text-[11px] font-semibold ${
                            card.status === "connected"
                              ? "bg-[var(--ts-teal)]/10 text-[var(--ts-teal)]"
                              : card.status === "degraded" ||
                                  card.status === "error"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-[var(--ts-mist)] text-[var(--ts-muted)]"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-[var(--ts-mist)] px-2 py-1 font-[family-name:var(--font-sora)] text-[11px] font-semibold text-[var(--ts-muted)]">
                          Coming soon
                        </span>
                      )}
                    </div>
                    {!comingSoon && card.account_name ? (
                      <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                        {card.account_name}
                      </p>
                    ) : null}
                    {!comingSoon ? (
                      <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                        Last successful sync:{" "}
                        {formatSyncTime(
                          card.last_successful_sync_at,
                          operator.timezone
                        )}
                      </p>
                    ) : (
                      <p className="mt-3 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                        We&apos;ll notify you when {label} connects are ready.
                      </p>
                    )}
                    {card.last_error_message ? (
                      <p className="mt-2 font-[family-name:var(--font-sora)] text-xs text-red-700">
                        {card.last_error_message}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
