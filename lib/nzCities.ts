// lib/nzStops.ts

import type { NzCity } from "@/lib/nzCities";

export type NzStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  aliases?: string[];
};

/**
 * Scenic / driving-route stops with coordinates.
 * Extend this list over time as we add more NZ waypoints.
 */
export const NZ_STOPS: NzStop[] = [
  {
    id: "lake-tekapo",
    name: "Lake Tekapo",
    lat: -43.8833,
    lng: 170.5183,
    aliases: ["Tekapo"],
  },
  {
    id: "wanaka",
    name: "Wānaka",
    lat: -44.698,
    lng: 169.135,
    aliases: ["Wanaka"],
  },
  {
    id: "lake-hawea",
    name: "Lake Hawea",
    lat: -44.6167,
    lng: 169.2333,
    aliases: ["Hawea"],
  },
  {
    id: "cromwell",
    name: "Cromwell",
    lat: -45.045,
    lng: 169.199,
  },
  {
    id: "milford-sound",
    name: "Milford Sound",
    lat: -44.6167,
    lng: 167.8667,
  },
  {
    id: "te-anau",
    name: "Te Anau",
    lat: -45.4145,
    lng: 167.7189,
  },
];

/**
 * Find a stop by a free-text label.
 * - Case-insensitive
 * - Matches name or any alias
 */
export function findStopByText(raw: string): NzStop | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;

  return NZ_STOPS.find((stop) => {
    if (stop.name.toLowerCase() === text) return true;
    return stop.aliases?.some((alias) => alias.toLowerCase() === text);
  });
}

/**
 * Map a list of user-entered waypoint strings to known stops.
 * - Ignores unknown names for now
 * - De-dupes by id, preserving order of first appearance
 */
export function matchStopsFromInputs(inputs: string[]): NzStop[] {
  const results: NzStop[] = [];

  for (const input of inputs) {
    const stop = findStopByText(input);
    if (!stop) continue;

    const alreadyIncluded = results.some((s) => s.id === stop.id);
    if (!alreadyIncluded) {
      results.push(stop);
    }
  }

  return results;
}

/**
 * Order waypoint names in a logical route order between start & end.
 *
 * Rough approach:
 *  - Take the vector from start -> end in lat/lng space.
 *  - For each matched stop, project its position onto that vector.
 *  - Sort by "progress" along that direction.
 *
 * Returns:
 *  - orderedNames: waypoint names to feed into the itinerary logic.
 *    (known stops use their canonical name; unknown names are appended,
 *     in their original input order, after the ordered known stops.)
 *  - matchedStopsInOrder: the NzStop objects in that same logical order,
 *    for use when drawing the map route.
 */
export function orderWaypointNamesByRoute(
  startCity: NzCity,
  endCity: NzCity,
  rawWaypointNames: string[]
): {
  orderedNames: string[];
  matchedStopsInOrder: NzStop[];
} {
  if (rawWaypointNames.length === 0) {
    return { orderedNames: [], matchedStopsInOrder: [] };
  }

  // 1. Match inputs to known stops (deduped)
  const matchedStops = matchStopsFromInputs(rawWaypointNames);
  if (matchedStops.length === 0) {
    // Nothing we recognise; leave order as-is
    return { orderedNames: rawWaypointNames, matchedStopsInOrder: [] };
  }

  // 2. Compute direction vector start -> end
  const dx = endCity.lat - startCity.lat;
  const dy = endCity.lng - startCity.lng;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;

  // 3. For each stop, compute "t" = progress along the start->end direction
  const stopsWithProgress = matchedStops.map((stop) => {
    const sx = stop.lat - startCity.lat;
    const sy = stop.lng - startCity.lng;
    const t = sx * dirX + sy * dirY; // projection length
    return { stop, t };
  });

  // 4. Sort by progress (earlier along the route first)
  stopsWithProgress.sort((a, b) => a.t - b.t);
  const sortedStops = stopsWithProgress.map((entry) => entry.stop);

  // 5. Build orderedNames:
  //    - Canonical names of sorted known stops
  //    - Then any unknown names that didn't map to stops, in input order
  const sortedKnownNames = sortedStops.map((s) => s.name);
  const sortedKnownIds = new Set(sortedStops.map((s) => s.id));

  const unknownNames = rawWaypointNames.filter((name) => {
    const stop = findStopByText(name);
    return !stop || !sortedKnownIds.has(stop.id);
  });

  const orderedNames = [...sortedKnownNames, ...unknownNames];

  return {
    orderedNames,
    matchedStopsInOrder: sortedStops,
  };
}
