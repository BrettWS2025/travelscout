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
        .order("created_at", { ascending: false });

      if (error) setError(error.message);
      setRows((data as ItineraryRow[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  async function saveExampleItinerary() {
    // Replace this with the real TripPlanner data
    const trip_input = { example: true };
    const trip_plan = { days: [{ dayNumber: 1, date: "2026-01-01", location: "Auckland" }] };

    setLoading(true);
    setError(null);

    const { error } = await supabase.from("itineraries").insert({
      title: "My NZ Trip",
      trip_input,
      trip_plan,
    });

    if (error) setError(error.message);

    // refresh list
    const { data } = await supabase
      .from("itineraries")
      .select("id,title,trip_input,trip_plan,created_at")
      .order("created_at", { ascending: false });

    setRows((data as ItineraryRow[]) ?? []);
    setLoading(false);
  }

  return (
    <main className="container py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your itineraries</h1>
        <button
          onClick={saveExampleItinerary}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900"
          disabled={loading}
        >
          Save example itinerary
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-4 text-sm text-white/70">Loading…</p>}

      <div className="mt-6 space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-white/60">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-white/70">No itineraries saved yet.</p>
        )}
      </div>
    </main>
  );
}
