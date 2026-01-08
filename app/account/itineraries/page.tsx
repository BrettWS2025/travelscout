"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type ItineraryRow = {
  id: string;
  title: string;
  trip_input: any;
  trip_plan: any;
  created_at: string;
};

export default function AccountItinerariesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [rows, setRows] = useState<ItineraryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.push("/auth/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("itineraries")
        .select("id,title,trip_input,trip_plan,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) setError(error.message);
      setRows((data as ItineraryRow[]) ?? []);
      setLoading(false);
    })();
  }, [user]);


  function getItinerarySummary(row: ItineraryRow) {
    const tripInput = row.trip_input;
    const tripPlan = row.trip_plan;

    if (!tripInput || !tripPlan) {
      return null;
    }

    const startCity = tripInput.startCity?.name || "Unknown";
    const endCity = tripInput.endCity?.name || "Unknown";
    const startDate = tripInput.startDate || "";
    const endDate = tripInput.endDate || "";
    const days = tripPlan.days?.length || 0;

    return { startCity, endCity, startDate, endDate, days };
  }

  return (
    <main className="container py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your itineraries</h1>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-4 text-sm text-white/70">Loading…</p>}

      <div className="mt-6 space-y-3">
        {rows.map((r) => {
          const summary = getItinerarySummary(r);
          return (
            <div key={r.id} className="card p-4 hover:bg-white/5 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1">{r.title}</div>
                  {summary && (
                    <div className="space-y-1 text-sm text-white/70">
                      <div>
                        <span className="font-medium">Route:</span> {summary.startCity} → {summary.endCity}
                      </div>
                      {summary.startDate && summary.endDate && (
                        <div>
                          <span className="font-medium">Dates:</span>{" "}
                          {new Date(summary.startDate + "T00:00:00").toLocaleDateString()} -{" "}
                          {new Date(summary.endDate + "T00:00:00").toLocaleDateString()}
                        </div>
                      )}
                      {summary.days > 0 && (
                        <div>
                          <span className="font-medium">Duration:</span> {summary.days} day{summary.days !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-white/50 mt-2">
                    Saved {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // TODO: Navigate to view/edit itinerary
                      alert("View/edit functionality coming soon!");
                    }}
                    className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-sm font-medium transition"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-white/70">No itineraries saved yet.</p>
            <p className="text-sm text-white/50 mt-2">
              Create an itinerary on the home page and save it to see it here.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
