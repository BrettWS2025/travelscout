// lib/itinerary.ts

import type { NzCity } from "@/lib/nzCities";

/**
 * Core trip types
 */

export type TripInput = {
  startCity: NzCity;
  endCity: NzCity;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  waypoints: string[]; // e.g. ["Lake Tekapo", "Cromwell"]
};

export type TripDay = {
  dayNumber: number;
  date: string;    // ISO YYYY-MM-DD
  location: string;
};

export type TripPlan = {
  days: TripDay[];
};

export type TripLeg = {
  from: string;
  to: string;
  distanceKm: number;
  driveHours: number;
};

/**
 * Date utilities
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Inclusive day count between two ISO dates.
 * Example: 2025-01-01 to 2025-01-03 => 3 days (1st, 2nd, 3rd)
 */
export function countDaysInclusive(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return 0;

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / MS_PER_DAY);
  return diffDays + 1;
}

/**
 * Build a TripPlan from a list of stops + "nights per stop" and a start date.
 *
 * We treat "nights per stop" here as "days at that stop" to keep things simple:
 * - totalDays = sum(nightsPerStop)
 * - Day 1..totalDays: each day gets a date and location in order.
 */
export function buildTripPlanFromStopsAndNights(
  stops: string[],
  nightsPerStop: number[],
  startDate: string
): TripPlan {
  if (!stops.length || !startDate) {
    return { days: [] };
  }

  const start = parseIsoDate(startDate);
  if (!start) return { days: [] };

  const days: TripDay[] = [];
  let current = start;
  let dayIndex = 0;

  for (let i = 0; i < stops.length; i++) {
    const location = stops[i];
    const rawNights = nightsPerStop[i] ?? 0;
    const nights = Math.max(0, Math.floor(rawNights));

    for (let n = 0; n < nights; n++) {
      const dateStr = toIsoDate(current);
      days.push({
        dayNumber: dayIndex + 1,
        date: dateStr,
        location,
      });
      current = addDays(current, 1);
      dayIndex++;
    }
  }

  return { days };
}

/**
 * "Simple" initial plan:
 * - Route stops = startCity + waypoints + endCity
 * - Total days = inclusive day count from startDate to endDate
 * - Distribute days fairly across all stops
 *   (at least 1 day per stop where possible; any extra days spread round-robin)
 */
export function buildSimpleTripPlan(input: TripInput): TripPlan {
  const { startCity, endCity, waypoints, startDate, endDate } = input;

  const stops: string[] = [
    startCity.name,
    ...waypoints,
    endCity.name,
  ];

  if (!stops.length || !startDate || !endDate) {
    return { days: [] };
  }

  const totalDays = countDaysInclusive(startDate, endDate);
  if (totalDays <= 0) {
    return {
      days: [
        {
          dayNumber: 1,
          date: startDate || toIsoDate(new Date()),
          location: startCity.name,
        },
      ],
    };
  }

  const stopCount = stops.length;
  if (stopCount === 0) return { days: [] };

  // Start with 1 day per stop
  const nightsPerStop: number[] = new Array(stopCount).fill(1);
  let remaining = totalDays - stopCount;

  // Distribute remaining days round-robin
  let idx = 0;
  while (remaining > 0) {
    nightsPerStop[idx % stopCount]++;
    idx++;
    remaining--;
  }

  return buildTripPlanFromStopsAndNights(stops, nightsPerStop, startDate);
}

/**
 * Great-circle distance (Haversine) between two lat/lng points in kilometres.
 * Used as a fallback when road routing fails.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Build rough straight-line legs from a list of map points.
 * Used as a fallback when our road routing API isn't available.
 */
export type MapPointForLegs = {
  lat: number;
  lng: number;
  name?: string;
};

export function buildLegsFromPoints(points: MapPointForLegs[]): TripLeg[] {
  if (!points || points.length < 2) return [];

  const legs: TripLeg[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];

    const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);

    // Very rough driving hours estimate: assume ~80 km/h average
    const driveHours = distanceKm / 80;

    legs.push({
      from: from.name ?? `Stop ${i + 1}`,
      to: to.name ?? `Stop ${i + 2}`,
      distanceKm,
      driveHours,
    });
  }

  return legs;
}
