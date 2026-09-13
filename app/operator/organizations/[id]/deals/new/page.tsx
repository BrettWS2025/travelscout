"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";
import { operatorHref } from "@/lib/hosts";
import { createDeal } from "@/lib/marketplace/client";
import type { BookingProvider, DealStatus } from "@/lib/marketplace/types";

const PROVIDERS: { value: BookingProvider; label: string }[] = [
  { value: "manual", label: "Manual booking link" },
  { value: "rezdy", label: "Rezdy" },
  { value: "fareharbor", label: "FareHarbor" },
  { value: "other", label: "Other" },
];

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewDealPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const { session } = useAuth();
  const onOperatorHost = useOnOperatorHost();

  const defaultDeparture = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    return toLocalInputValue(d);
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [locationName, setLocationName] = useState("");
  const [departureAt, setDepartureAt] = useState(defaultDeparture);
  const [spotsLeft, setSpotsLeft] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [currency, setCurrency] = useState("NZD");
  const [status, setStatus] = useState<DealStatus>("draft");
  const [bookingProvider, setBookingProvider] =
    useState<BookingProvider>("manual");
  const [bookingUrl, setBookingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const departureIso = new Date(departureAt).toISOString();
      const { deal } = await createDeal(
        {
          organizationId,
          title,
          description: description || undefined,
          category: category || undefined,
          locationName: locationName || undefined,
          departureAt: departureIso,
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
      router.push(
        operatorHref(
          `/operator/organizations/${organizationId}/deals/${deal.id}`,
          onOperatorHost
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">New deal</h2>
        <p className="text-sm text-slate-600 mt-1">
          Live deals must depart within 3 days and include a booking URL.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Title *</span>
        <input
          className="input-dark w-full"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Afternoon jet boat — 40% off"
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
            placeholder="Adventure"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Location</span>
          <input
            className="input-dark w-full"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="Queenstown"
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
          placeholder="https://book.example.com/activity"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg px-4 py-2 text-white font-medium disabled:opacity-60"
        style={{ background: "linear-gradient(to right, #3b82f6, #6366f1)" }}
      >
        {loading ? "Saving…" : status === "live" ? "Publish deal" : "Save draft"}
      </button>
    </form>
  );
}
