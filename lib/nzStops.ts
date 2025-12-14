// lib/nzStops.ts

export type NzStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  aliases?: string[];
};

/**
 * Scenic / driving-route stops with coordinates.
 * We can extend this list over time as we add more NZ waypoints.
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
    lat: -44.6980,
    lng: 169.1350,
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
    lat: -45.0450,
    lng: 169.1990,
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
