// app/(product)/trip-planner/page.tsx
import type { Metadata } from "next";
import TripPlanner from "@/components/TripPlanner";

export const metadata: Metadata = {
  title: "Trip Planner | TravelScout",
  description: "Plan your New Zealand road trip with TravelScout.",
};

export default function TripPlannerPage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-3xl font-bold">
        Build your NZ road trip
      </h1>

      <p className="mb-6 text-sm text-gray-500">
        Start with your dates and key stops. We’ll help you sketch a
        day-by-day itinerary.
      </p>

      <TripPlanner />
    </main>
  );
}
