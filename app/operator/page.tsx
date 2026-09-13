"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listMyOrganizations } from "@/lib/marketplace/client";
import type { Organization } from "@/lib/marketplace/types";

export default function OperatorDashboardPage() {
  const { session } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyOrganizations(session?.access_token);
      setOrganizations(data.organizations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="card p-4 text-red-600 border-red-200 bg-red-50">{error}</div>
      )}

      {loading ? (
        <div className="card p-6 text-slate-500">Loading organizations…</div>
      ) : organizations.length === 0 ? (
        <div className="card p-8 text-center space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Create your first operator profile
          </h2>
          <p className="text-slate-600 max-w-lg mx-auto">
            Organizations own last-minute deals. Set one up, then publish
            discounted activities departing within 3 days.
          </p>
          <Link
            href="/operator/organizations/new"
            className="inline-flex rounded-lg px-4 py-2 text-white font-medium"
            style={{
              background: "linear-gradient(to right, #3b82f6, #6366f1)",
            }}
          >
            Create organization
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {organizations.map((org) => (
            <Link
              key={org.id}
              href={`/operator/organizations/${org.id}`}
              className="card p-5 hover:shadow-lg transition-shadow block"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {org.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {[org.region, org.defaultBookingProvider]
                      .filter(Boolean)
                      .join(" · ") || "No region set"}
                  </p>
                </div>
                <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-1">
                  Manage
                </span>
              </div>
              {org.website && (
                <p className="text-sm text-indigo-600 mt-3 truncate">
                  {org.website}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
