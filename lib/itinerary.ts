// lib/itinerary.ts

import type { NzCity } from "@/lib/nzCities";

export type TripInput = {
  startCity: NzCity;
  endCity: NzCity;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  waypoints: string[]; // e.g. ["Lake Tekapo", "Cromwell"]
};

export type TripDay = {
  dayNumber: number;
  date: string;   // ISO YYYY-MM-DD
  location: string;
};

export type TripPlan = {
  days: TripDay[];
};

// ---- Logistics / legs ----

export type TripLeg = {
  from: string;
  to: string;
  distanceKm: number;
  driveHours: number;
};

export type BasicPoint = {
  lat: number;
  lng: number;
  name?: string;
};

// -------------------------
// Date helpers
// -------------------------

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseDate(dateStr: string, label: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label} date`);
  }
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatIsoDate(date: Date): string {
  // YYYY-MM-DD from local date
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// -------------------------
// Haversine distance + drive time
// -------------------------

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Rough great-circle distance in km between two lat/lng points.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
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
 * Very rough drive-time estimate for NZ highways.
 * You can tweak the average speed later if needed.
 */
export function estimateDriveHours(distanceKm: number): number {
  const avgSpeedKmh = 85; // typical NZ highway average
  return distanceKm / avgSpeedKmh;
}

/**
 * Build driving legs between successive points in a route:
 *   p0 -> p1, p1 -> p2, ...
 */
export function buildLegsFromPoints(points: BasicPoint[]): TripLeg[] {
  if (!points || points.length < 2) return [];

  const legs: TripLeg[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    const distanceKm = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
    const driveHours = estimateDriveHours(distanceKm);

    legs.push({
      from: a.name ?? `Stop ${i + 1}`,
      to: b.name ?? `Stop ${i + 2}`,
      distanceKm,
      driveHours,
    });
  }

  return legs;
}

// -------------------------
// Simple trip-plan generator
// -------------------------

export function buildSimpleTripPlan(input: TripInput): TripPlan {
  const { startCity, endCity, startDate, endDate, waypoints } = input;

  if (!startDate || !endDate) {
    // No dates = no day-by-day plan yet
    return { days: [] };
  }

  const start = parseDate(startDate, "start");
  const end = parseDate(endDate, "end");

  if (end < start) {
    throw new Error("End date must be on or after start date.");
  }

  const diffMs = end.getTime() - start.getTime();
  const totalDays = Math.floor(diffMs / MS_PER_DAY) + 1;

  if (totalDays <= 0) {
    throw new Error("Trip must be at least one day long.");
  }

  // Build ordered list of "stops" by name: start city, waypoints, end city
  const rawStops = [
    startCity.name,
    ...waypoints.map((w) => w.trim()).filter(Boolean),
    endCity.name,
  ];

  // Deduplicate while preserving order
  const stops: string[] = [];
  for (const name of rawStops) {
    if (!name) continue;
    if (!stops.includes(name)) {
      stops.push(name);
    }
  }

  const numStops = stops.length;
  if (numStops === 0) {
    return { days: [] };
  }

  // Distribute totalDays across stops as evenly as possible.
  const baseDaysPerStop = Math.floor(totalDays / numStops);
  let remainder = totalDays % numStops;

  const days: TripDay[] = [];
  let currentDate = start;
  let dayCounter = 1;

  for (let i = 0; i < numStops; i++) {
    const stop = stops[i];

    // Every stop gets at least baseDaysPerStop days
    let daysHere = baseDaysPerStop;

    // Spread the remainder: first 'remainder' stops get +1 day
    if (remainder > 0) {
      daysHere += 1;
      remainder -= 1;
    }

    for (let d = 0; d < daysHere; d++) {
      if (dayCounter > totalDays) break;

      days.push({
        dayNumber: dayCounter,
        date: formatIsoDate(currentDate),
        location: stop,
      });

      dayCounter += 1;
      currentDate = addDays(currentDate, 1);
    }
  }

  return { days };
}
