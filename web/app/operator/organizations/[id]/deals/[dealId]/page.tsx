"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { OperatorLink } from "@/components/OperatorLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";
import { operatorHref } from "@/lib/hosts";
import {
  deleteDeal,
  getDeal,
  updateDeal,
} from "@/lib/marketplace/client";
import type { BookingProvider, Deal, DealStatus } from "@/lib/marketplace/types";

const PROVIDERS: { value: BookingProvider; label: string }[] = [
  { value: "manual", label: "Manual booking link" },
  { value: "rezdy", label: "Rezdy" },
  { value: "fareharbor", label: "FareHarbor" },
  { value: "other", label: "Other" },
];

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditDealPage() {
  const router = useRouter();
  const params = useParams<{ id: string; dealId: string }>();
  const organizationId = params.id;
  const dealId = params.dealId;
  const { session } = useAuth();
  const onOperatorHost = useOnOperatorHost();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [locationName, setLocationName] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [spotsLeft, setSpotsLeft] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [currency, setCurrency] = useState("NZD");
  const [status, setStatus] = useState<DealStatus>("draft");
  const [bookingProvider, setBookingProvider] =
    useState<BookingProvider>("manual");
  const [bookingUrl, setBookingUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { deal: loaded } = await getDeal(dealId, session?.access_token);
      setDeal(loaded);
      setTitle(loaded.title);
      setDescription(loaded.description || "");
      setCategory(loaded.category || "");
      setLocationName(loaded.locationName || "");
      setDepartureAt(toLocalInputValue(loaded.departureAt));
      setSpotsLeft(
        loaded.spotsLeft != null ? String(loaded.spotsLeft) : ""
      );
      setOriginalPrice(
        loaded.originalPrice != null ? String(loaded.originalPrice) : ""
      );
      setDealPrice(String(loaded.dealPrice));
      setCurrency(loaded.currency || "NZD");
      setStatus(loaded.status);
      setBookingProvider(loaded.bookingProvider);
      setBookingUrl(loaded.bookingUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal.");
    } finally {
      setLoading(false);
    }
  }, [dealId, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { deal: updated } = await updateDeal(
        dealId,
        {
          title,
          description: description || undefined,
          category: category || undefined,
          locationName: locationName || undefined,
          departureAt: new Date(departureAt).toISOString(),
          spotsLeft: spotsLeft ? Number(spotsLeft) : undefined,
          originalPrice: originalPrice ? Number(originalPrice) : undefined,
          dealPrice: Number(dealPrice),
          currency,
          status,
          bookingProvider,
          bookingUrl: bookingUrl || undefined,
        },
        session?.access_token
      );
      setDeal(updated);
      setMessage(
        updated.status === "live" ? "Deal is live." : "Deal saved."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deal.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this deal? This cannot be undone.")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDeal(dealId, session?.access_token);
      router.push(
        operatorHref(`/operator/organizations/${organizationId}`, onOperatorHost)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete deal.");
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card p-6 text-slate-500">Loading deal…</div>;
  }

  if (!deal) {
    return (
      <div className="card p-6 text-red-600">
        {error || "Deal not found."}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Edit deal</h2>
          <p className="text-sm text-slate-600 mt-1">
            <OperatorLink
              href={`/operator/organizations/${organizationId}`}
              className="text-indigo-600 hover:underline"
            >
              Back to organization
            </OperatorLink>
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline"
          disabled={saving}
        >
          Delete
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && <p className="text-emerald-600 text-sm">{message}</p>}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Title *</span>
        <input
          className="input-dark w-full"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Description</span>
        <textarea
          className="input-dark w-full min-h-[100px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <input
            className="input-dark w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Location</span>
          <input
            className="input-dark w-full"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Departure date & time *
        </span>
        <input
          className="input-dark w-full"
          type="datetime-local"
          required
          value={departureAt}
          onChange={(e) => setDepartureAt(e.target.value)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Deal price *</span>
          <input
            className="input-dark w-full"
            type="number"
            min="0"
            step="0.01"
            required
            value={dealPrice}
            onChange={(e) => setDealPrice(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Original price
          </span>
          <input
            className="input-dark w-full"
            type="number"
            min="0"
            step="0.01"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Currency</span>
          <input
            className="input-dark w-full"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Spots left</span>
        <input
          className="input-dark w-full"
          type="number"
          min="0"
          value={spotsLeft}
          onChange={(e) => setSpotsLeft(e.target.value)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <select
            className="input-dark w-full"
            value={status}
            onChange={(e) => setStatus(e.target.value as DealStatus)}
          >
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="expired">Expired</option>
            <option value="sold_out">Sold out</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Booking provider
          </span>
          <select
            className="input-dark w-full"
            value={bookingProvider}
            onChange={(e) =>
              setBookingProvider(e.target.value as BookingProvider)
            }
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Booking URL {status === "live" ? "*" : ""}
        </span>
        <input
          className="input-dark w-full"
          type="url"
          required={status === "live"}
          value={bookingUrl}
          onChange={(e) => setBookingUrl(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg px-4 py-2 text-white font-medium disabled:opacity-60"
        style={{ background: "linear-gradient(to right, #3b82f6, #6366f1)" }}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
