// lib/itinerary.ts
import type { NzCity } from "./nzCities";

export type TripInput = {
  startCity: NzCity;
  endCity: NzCity;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  waypoints: string[]; // e.g. ["Lake Tekapo", "Dunedin", "Milford Sound"]
};

export type TripDay = {
  dayNumber: number;
  date: string;   // ISO YYYY-MM-DD
  location: string;
};

export type TripPlan = {
  days: TripDay[];
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return d;
}

function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function buildSimpleTripPlan(input: TripInput): TripPlan {
  const { startCity, endCity, startDate, endDate, waypoints } = input;

  if (!startCity || !endCity) {
    throw new Error("Please select both a start city and an end city.");
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    throw new Error("End date must be on or after the start date.");
  }

  const totalDays = Math.floor(diffMs / MS_PER_DAY) + 1; // inclusive
  if (totalDays <= 0) {
    throw new Error("Trip must be at least 1 day long.");
  }

  // Build stops: start → waypoints → end (for now, waypoints are just free-text names)
  const rawStops = [
    startCity.name,
    ...waypoints,
    endCity.name,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const stops: string[] = [];
  for (const s of rawStops) {
    if (!stops.includes(s)) {
      stops.push(s);
    }
  }

  if (stops.length === 0) {
    throw new Error("Please provide at least one location.");
  }

  const effectiveStops = stops.slice(0, totalDays);
  const numStops = effectiveStops.length;

  const baseDaysPerStop = Math.floor(totalDays / numStops);
  let remainder = totalDays % numStops;

  const daysPerStop: number[] = new Array(numStops).fill(baseDaysPerStop);
  for (let i = 0; remainder > 0; i++, remainder--) {
    daysPerStop[i % numStops] += 1;
  }

  const days: TripDay[] = [];
  let currentDate = start;
  let dayCounter = 1;

  for (let i = 0; i < numStops; i++) {
    const location = effectiveStops[i];
    const span = daysPerStop[i];

    for (let j = 0; j < span; j++) {
      days.push({
        dayNumber: dayCounter,
        date: formatIsoDate(currentDate),
        location,
      });
      dayCounter += 1;
      currentDate = addDays(currentDate, 1);
    }
  }

  return { days };
}
