"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  NotificationsApiError,
  getMyNotificationPreferencesApi,
  patchMyNotificationPreferenceApi,
  type NotificationPreferenceRow,
} from "@/lib/marketplace/notifications-client";
import {
  NOTIFICATION_CHANNEL_LABELS,
  wouldDisableLastMandatoryChannel,
  type NotificationChannelKey,
} from "@/lib/marketplace/notifications-ui";

function ChannelToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm ${
        disabled
          ? "cursor-not-allowed text-[var(--ts-muted)]/50"
          : "cursor-pointer text-[var(--ts-ink)]"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-[var(--ts-ink)]/30"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="hidden sm:inline">{label}</span>
    </label>
  );
}

export function NotificationsSettings() {
  const { session, user, isLoading: authLoading } = useAuth();
  const token = session?.access_token ?? null;

  const [operators, setOperators] = useState<MyOperator[]>([]);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const loadOperators = useCallback(async () => {
    if (!token) return;
    const res = await listMyOperators(token);
    setOperators(res.operators);
    if (res.operators.length && !operatorId) {
      setOperatorId(res.operators[0]!.id);
    }
  }, [token, operatorId]);

  const loadPrefs = useCallback(async () => {
    if (!token || !operatorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyNotificationPreferencesApi(operatorId, token);
      setPrefs(res.preferences);
    } catch (err) {
      setError(
        err instanceof NotificationsApiError
          ? err.message
          : "Failed to load preferences"
      );
    } finally {
      setLoading(false);
    }
  }, [token, operatorId]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadOperators();
  }, [authLoading, token, loadOperators]);

  useEffect(() => {
    if (!operatorId || !token) return;
    void loadPrefs();
  }, [operatorId, token, loadPrefs]);

  async function toggleChannel(
    row: NotificationPreferenceRow,
    channel: NotificationChannelKey,
    next: boolean
  ) {
    if (!token || !operatorId) return;

    if (
      wouldDisableLastMandatoryChannel(
        {
          event_type: row.event_type as import("@/lib/marketplace/settings").NotificationEventType,
          email: row.email,
          sms: row.sms,
          in_app: row.in_app,
        },
        channel,
        next
      )
    ) {
      setBanner(
        "At least one channel must stay on for this required notification."
      );
      return;
    }

    const key = `${row.event_type}:${channel}`;
    setSavingKey(key);
    setBanner(null);
    setError(null);

    const body: {
      event_type: string;
      email?: boolean;
      sms?: boolean;
      in_app?: boolean;
    } = { event_type: row.event_type };
    if (channel === "email") body.email = next;
    if (channel === "sms") body.sms = next;
    if (channel === "in_app") body.in_app = next;

    // Optimistic
    setPrefs((prev) =>
      prev.map((p) =>
        p.event_type === row.event_type
          ? {
              ...p,
              email: channel === "email" ? next : p.email,
              sms: channel === "sms" ? next : p.sms,
              in_app: channel === "in_app" ? next : p.in_app,
            }
          : p
      )
    );

    try {
      const res = await patchMyNotificationPreferenceApi(
        operatorId,
        token,
        body
      );
      setPrefs(res.preferences);
    } catch (err) {
      await loadPrefs();
      setError(
        err instanceof NotificationsApiError
          ? err.message
          : "Failed to save preference"
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading…
        </p>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Sign in to manage notifications.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ts-ink)]">
          Notifications
        </h1>
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Choose how you hear about deals and integrations for this operator.
          Starred events need at least one channel on.
        </p>
      </div>

      <SettingsSubnav />

      {operators.length > 1 ? (
        <div>
          <label
            htmlFor="notif-operator"
            className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
          >
            Operator
          </label>
          <select
            id="notif-operator"
            className="mt-1 w-full max-w-md rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
            value={operatorId ?? ""}
            onChange={(e) => setOperatorId(e.target.value)}
          >
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.tradingName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {banner ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-amber-900"
        >
          {banner}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading preferences…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/40">
                <th className="px-4 py-3 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                  Event
                </th>
                {(
                  Object.keys(NOTIFICATION_CHANNEL_LABELS) as NotificationChannelKey[]
                ).map((ch) => (
                  <th
                    key={ch}
                    className="px-3 py-3 text-center font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]"
                  >
                    {NOTIFICATION_CHANNEL_LABELS[ch]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prefs.map((row) => (
                <tr
                  key={row.event_type}
                  className="border-b border-[var(--ts-ink)]/5 last:border-0"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                      {row.label}
                      {row.mandatory ? (
                        <span
                          className="ml-1 text-amber-600"
                          title="Required — at least one channel must stay on"
                          aria-label="Required"
                        >
                          *
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-md font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      {row.description}
                    </p>
                  </td>
                  {(
                    ["email", "sms", "in_app"] as NotificationChannelKey[]
                  ).map((ch) => {
                    const checked =
                      ch === "email"
                        ? row.email
                        : ch === "sms"
                          ? row.sms
                          : row.in_app;
                    const busy = savingKey === `${row.event_type}:${ch}`;
                    return (
                      <td key={ch} className="px-3 py-4 text-center align-middle">
                        <ChannelToggle
                          checked={checked}
                          disabled={busy}
                          label={`${NOTIFICATION_CHANNEL_LABELS[ch]} for ${row.label}`}
                          onChange={(next) => void toggleChannel(row, ch, next)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
        * Required events cannot have every channel turned off.
      </p>
    </div>
  );
}
