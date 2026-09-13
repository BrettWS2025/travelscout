"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createOrganization } from "@/lib/marketplace/client";
import type { BookingProvider } from "@/lib/marketplace/types";

const PROVIDERS: { value: BookingProvider; label: string }[] = [
  { value: "manual", label: "Manual booking link" },
  { value: "rezdy", label: "Rezdy" },
  { value: "fareharbor", label: "FareHarbor" },
  { value: "other", label: "Other" },
];

export default function NewOrganizationPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [website, setWebsite] = useState("");
  const [defaultBookingProvider, setDefaultBookingProvider] =
    useState<BookingProvider>("manual");
  const [fareharborShortname, setFareharborShortname] = useState("");
  const [fareharborAsn, setFareharborAsn] = useState("");
  const [rezdyAffiliateCode, setRezdyAffiliateCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { organization } = await createOrganization(
        {
          name,
          region: region || undefined,
          website: website || undefined,
          defaultBookingProvider,
          fareharborShortname: fareharborShortname || undefined,
          fareharborAsn: fareharborAsn || undefined,
          rezdyAffiliateCode: rezdyAffiliateCode || undefined,
        },
        session?.access_token
      );
      router.push(`/operator/organizations/${organization.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          New organization
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          This is your operator profile for publishing last-minute deals.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Name *</span>
        <input
          className="input-dark w-full"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Queenstown Jetboats"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Region</span>
        <input
          className="input-dark w-full"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Queenstown"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Website</span>
        <input
          className="input-dark w-full"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Default booking provider
        </span>
        <select
          className="input-dark w-full"
          value={defaultBookingProvider}
          onChange={(e) =>
            setDefaultBookingProvider(e.target.value as BookingProvider)
          }
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {defaultBookingProvider === "fareharbor" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              FareHarbor shortname
            </span>
            <input
              className="input-dark w-full"
              value={fareharborShortname}
              onChange={(e) => setFareharborShortname(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              FareHarbor ASN
            </span>
            <input
              className="input-dark w-full"
              value={fareharborAsn}
              onChange={(e) => setFareharborAsn(e.target.value)}
            />
          </label>
        </div>
      )}

      {defaultBookingProvider === "rezdy" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">
            Rezdy affiliate code
          </span>
          <input
            className="input-dark w-full"
            value={rezdyAffiliateCode}
            onChange={(e) => setRezdyAffiliateCode(e.target.value)}
          />
        </label>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg px-4 py-2 text-white font-medium disabled:opacity-60"
        style={{ background: "linear-gradient(to right, #3b82f6, #6366f1)" }}
      >
        {loading ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
