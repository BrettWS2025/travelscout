"use client";

import { useEffect, useState } from "react";
import {
  getOperatorDeal,
  updateOperatorDealSeatsApi,
  OperatorDealsApiError,
} from "@/lib/marketplace/operator-deals-client";

type Props = {
  dealId: string;
  dealTitle: string | null;
  accessToken?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function UpdateSeatsDialog({
  dealId,
  dealTitle,
  accessToken,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<
    Array<{ id: string; startAt: string; label: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await getOperatorDeal(dealId, accessToken);
        if (cancelled) return;
        const next: Record<string, number> = {};
        const rows = detail.sessions.map((s) => {
          next[s.id] = s.manualSeatsAvailable ?? s.seatsDisplayed ?? 0;
          return {
            id: s.id,
            startAt: s.startAt,
            label: new Date(s.startAt).toLocaleString(),
          };
        });
        setSessions(rows);
        setSeats(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sessions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, accessToken]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateOperatorDealSeatsApi(dealId, seats, accessToken);
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update seats"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-seats-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--ts-ink)]/10 bg-white p-5 shadow-[0_24px_60px_rgba(16,36,28,0.18)]">
        <h3
          id="update-seats-title"
          className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]"
        >
          Update seats
        </h3>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          {dealTitle ?? "Untitled deal"}
        </p>

        {loading ? (
          <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Loading sessions…
          </p>
        ) : sessions.length === 0 ? (
          <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            No sessions on this deal.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 font-[family-name:var(--font-sora)] text-sm"
              >
                <span className="text-[var(--ts-ink)]">{s.label}</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  className="w-20 rounded-lg border border-[var(--ts-ink)]/15 px-2 py-1.5 text-right"
                  value={seats[s.id] ?? 0}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setSeats((prev) => ({
                      ...prev,
                      [s.id]: Number.isFinite(n)
                        ? Math.min(999, Math.max(0, n))
                        : 0,
                    }));
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading || sessions.length === 0}
            onClick={() => void save()}
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save seats"}
          </button>
        </div>
      </div>
    </div>
  );
}
