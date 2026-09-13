"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  getOrganization,
  listOrganizationDeals,
} from "@/lib/marketplace/client";
import type { Deal, Organization } from "@/lib/marketplace/types";

function statusClass(status: Deal["status"]) {
  switch (status) {
    case "live":
      return "bg-emerald-100 text-emerald-700";
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "expired":
      return "bg-amber-100 text-amber-800";
    case "sold_out":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const { session } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, dealsRes] = await Promise.all([
        getOrganization(organizationId, session?.access_token),
        listOrganizationDeals(organizationId, session?.access_token),
      ]);
      setOrganization(orgRes.organization);
      setDeals(dealsRes.deals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="card p-6 text-slate-500">Loading organization…</div>;
  }

  if (error || !organization) {
    return (
      <div className="card p-6 text-red-600">
        {error || "Organization not found."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {organization.name}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {[organization.region, organization.defaultBookingProvider]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link
          href={`/operator/organizations/${organization.id}/deals/new`}
          className="inline-flex rounded-lg px-4 py-2 text-white font-medium"
          style={{ background: "linear-gradient(to right, #3b82f6, #6366f1)" }}
        >
          New deal
        </Link>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">Deals</h3>
        {deals.length === 0 ? (
          <div className="card p-6 text-slate-600">
            No deals yet. Create a draft, then publish it live when departure is
            within 3 days.
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/operator/organizations/${organization.id}/deals/${deal.id}`}
                className="card p-4 block hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-900">
                        {deal.title}
                      </h4>
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 ${statusClass(deal.status)}`}
                      >
                        {deal.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      Departs {formatWhen(deal.departureAt)}
                      {deal.locationName ? ` · ${deal.locationName}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-slate-800 font-medium">
                    {deal.currency} {Number(deal.dealPrice).toFixed(2)}
                    {deal.originalPrice != null && (
                      <span className="ml-2 text-slate-400 line-through font-normal">
                        {deal.currency} {Number(deal.originalPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
