import type { TripPlan } from "@/lib/itinerary";
import type { DayDetail } from "@/lib/trip-planner/utils";
import { makeDayKey } from "@/lib/trip-planner/utils";
import type { CityLite } from "@/lib/trip-planner/utils";
import { safeWriteRecent } from "@/lib/trip-planner/utils";

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function syncDayDetailsFromPlan(
  nextPlan: TripPlan,
  prevDayDetails: Record<string, DayDetail>
): Record<string, DayDetail> {
  const next: Record<string, DayDetail> = {};
  for (const d of nextPlan.days) {
    const key = makeDayKey(d.date, d.location);
    next[key] =
      prevDayDetails[key] ?? {
        notes: "",
        accommodation: "",
        isOpen: false,
        experiences: [],
      };
  }
  return next;
}

export function pushRecent(
  city: CityLite,
  currentRecent: CityLite[]
): CityLite[] {
  const next = [city, ...currentRecent.filter((r) => r.id !== city.id)].slice(0, 8);
  safeWriteRecent(next);
  return next;
}
