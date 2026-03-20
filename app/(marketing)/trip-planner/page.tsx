// app/(product)/trip-planner/page.tsx
import type { Metadata } from "next";
import TripPlanner from "@/components/TripPlanner";

export const metadata: Metadata = {
  title: "Trip Planner | TravelScout",
  description: "Plan your New Zealand road trip with TravelScout.",
};

export default function TripPlannerPage() {
  return (
    <main className="mx-auto max-w-5xl p-6 text-center">
      <TripPlanner />
    </main>
  );
}
