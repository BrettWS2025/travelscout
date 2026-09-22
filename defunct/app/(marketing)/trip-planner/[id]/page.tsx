"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import TripPlanner from "@/components/TripPlanner";
import type { TripInput } from "@/lib/itinerary";

type ItineraryData = {
  id: string;
  title: string;
  trip_input: TripInput;
  trip_plan: any;
  created_at: string;
};

export default function EditItineraryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const itineraryId = params.id as string;

  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("itineraries")
        .select("id,title,trip_input,trip_plan,created_at")
        .eq("id", itineraryId)
        .eq("user_id", user.id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Itinerary not found");
        setLoading(false);
        return;
      }

      setItinerary(data as ItineraryData);
      setLoading(false);
    })();
  }, [user, authLoading, router, itineraryId]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-white/70">Loading itinerary...</p>
      </main>
    );
  }

  if (error || !itinerary) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="card p-6">
          <h1 className="text-2xl font-semibold mb-4">Error</h1>
          <p className="text-red-400 mb-4">{error || "Itinerary not found"}</p>
          <button
            onClick={() => router.push("/account/itineraries")}
            className="px-4 py-2 rounded text-white font-medium transition-all hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
            style={{ 
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
          >
            Back to Itineraries
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{itinerary.title}</h1>
        <p className="text-sm text-gray-500">
          Saved {new Date(itinerary.created_at).toLocaleString()}
        </p>
      </div>

      <TripPlanner initialItinerary={itinerary} />
    </main>
  );
}

