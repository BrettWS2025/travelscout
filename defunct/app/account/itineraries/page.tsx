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


  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleDeleteItinerary(id: string) {
    if (!confirm("Are you sure you want to delete this itinerary? This action cannot be undone.")) {
      return;
    }

    if (!user) return;

    setDeletingId(id);
    setDeleteError(null);

    try {
      const { error } = await supabase
        .from("itineraries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        setDeleteError(error.message);
        setDeletingId(null);
        return;
      }

      // Refresh the list
      const { data, error: fetchError } = await supabase
        .from("itineraries")
        .select("id,title,trip_input,trip_plan,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setDeleteError(fetchError.message);
      } else {
        setRows((data as ItineraryRow[]) ?? []);
      }

      setDeletingId(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete itinerary";
      setDeleteError(errorMessage);
      setDeletingId(null);
    }
  }

  return (
    <main className="container py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your itineraries</h1>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {deleteError && <p className="mt-4 text-sm text-red-400">{deleteError}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600">Loading…</p>}

      <div className="mt-6 space-y-3">
        {rows.map((r) => {
          const summary = getItinerarySummary(r);
          return (
            <div key={r.id} className="card p-4 hover:bg-slate-50 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1 text-slate-900">{r.title}</div>
                  {summary && (
                    <div className="space-y-1 text-sm text-slate-600">
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
                  <div className="text-xs text-slate-500 mt-2">
                    Saved {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      router.push(`/trip-planner/${r.id}`);
                    }}
                    className="px-3 py-1.5 rounded text-white hover:brightness-110 text-sm font-medium transition shadow-lg hover:shadow-xl"
                    style={{ 
                      background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                    }}
                  >
                    View & Update
                  </button>
                  <button
                    onClick={() => handleDeleteItinerary(r.id)}
                    disabled={deletingId === r.id}
                    className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed border border-red-600/30"
                  >
                    {deletingId === r.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-slate-600">No itineraries saved yet.</p>
            <p className="text-sm text-slate-500 mt-2">
              Create an itinerary on the home page and save it to see it here.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
