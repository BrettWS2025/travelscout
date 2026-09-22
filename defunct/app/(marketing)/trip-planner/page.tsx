// app/(product)/trip-planner/page.tsx
import type { Metadata } from "next";
import TripPlanner from "@/components/TripPlanner";

export const metadata: Metadata = {
  title: "Trip Planner | TravelScout",
  description: "Plan your New Zealand road trip with TravelScout.",
};

export default function TripPlannerPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-[5px] pt-[5px] pb-6 md:p-6 text-center">
      <TripPlanner />
    </main>
  );
}
