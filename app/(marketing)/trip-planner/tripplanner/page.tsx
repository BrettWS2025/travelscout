// app/(product)/trip-planner/page.tsx
import TripPlanner from "@/components/TripPlanner";

export const metadata = {
  title: "Trip Planner | TravelScout",
};

export default function TripPlannerPage() {
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Build your NZ road trip</h1>
      <p className="text-sm mb-6 text-gray-500">
        Start with your dates and key stops. We’ll help you sketch a day-by-day itinerary.
      </p>
      <TripPlanner />
    </main>
  );
}

