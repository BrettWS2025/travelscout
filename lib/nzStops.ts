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
 *
 * NOTE:
 *  - Coords are approximate but good enough for routing / distance.
 *  - Aliases let users type simpler names (e.g. "Tekapo" for "Lake Tekapo").
 */
export const NZ_STOPS: NzStop[] = [
  // ---- South Island: East Coast / Inland spine ----
  {
    id: "kaikoura",
    name: "Kaikōura",
    lat: -42.4019,
    lng: 173.6810,
    aliases: ["Kaikoura"],
  },
  {
    id: "hanmer-springs",
    name: "Hanmer Springs",
    lat: -42.5200,
    lng: 172.8280,
  },
  {
    id: "blenheim",
    name: "Blenheim",
    lat: -41.5134,
    lng: 173.9612,
  },
  {
    id: "picton",
    name: "Picton",
    lat: -41.2903,
    lng: 174.0010,
  },
  {
    id: "nelson",
    name: "Nelson",
    lat: -41.2706,
    lng: 173.2840,
  },

  // ---- West Coast & passes ----
  {
    id: "arthurs-pass",
    name: "Arthur's Pass",
    lat: -42.9440,
    lng: 171.5670,
    aliases: ["Arthurs Pass"],
  },
  {
    id: "greymouth",
    name: "Greymouth",
    lat: -42.4500,
    lng: 171.2100,
  },
  {
    id: "hokitika",
    name: "Hokitika",
    lat: -42.7167,
    lng: 170.9667,
  },
  {
    id: "franz-josef",
    name: "Franz Josef",
    lat: -43.3850,
    lng: 170.1830,
    aliases: ["Franz Josef Glacier"],
  },
  {
    id: "fox-glacier",
    name: "Fox Glacier",
    lat: -43.4620,
    lng: 170.0180,
  },
  {
    id: "haast",
    name: "Haast",
    lat: -43.8810,
    lng: 169.0430,
  },
  {
    id: "punakaiki",
    name: "Punakaiki",
    lat: -42.1220,
    lng: 171.3260,
  },
  {
    id: "westport",
    name: "Westport",
    lat: -41.7520,
    lng: 171.6000,
  },

  // ---- Mackenzie & Southern Lakes ----
  {
    id: "lake-tekapo",
    name: "Lake Tekapo",
    lat: -43.8833,
    lng: 170.5183,
    aliases: ["Tekapo"],
  },
  {
    id: "twizel",
    name: "Twizel",
    lat: -44.2480,
    lng: 170.0950,
  },
  {
    id: "mt-cook-village",
    name: "Aoraki / Mount Cook Village",
    lat: -43.7360,
    lng: 170.1020,
    aliases: ["Mount Cook", "Mt Cook", "Aoraki"],
  },
  {
    id: "omarama",
    name: "Ōmarama",
    lat: -44.4833,
    lng: 169.9667,
    aliases: ["Omarama"],
  },
  {
    id: "lake-hawea",
    name: "Lake Hawea",
    lat: -44.6167,
    lng: 169.2333,
    aliases: ["Hawea"],
  },
  {
    id: "wanaka",
    name: "Wānaka",
    lat: -44.6980,
    lng: 169.1350,
    aliases: ["Wanaka"],
  },
  {
    id: "cromwell",
    name: "Cromwell",
    lat: -45.0450,
    lng: 169.1990,
  },
  {
    id: "clyde",
    name: "Clyde",
    lat: -45.1860,
    lng: 169.3200,
  },
  {
    id: "alexandra",
    name: "Alexandra",
    lat: -45.2480,
    lng: 169.3790,
  },
  {
    id: "arrowtown",
    name: "Arrowtown",
    lat: -44.9380,
    lng: 168.8350,
  },

  // ---- Fiordland & Southland ----
  {
    id: "te-anau",
    name: "Te Anau",
    lat: -45.4145,
    lng: 167.7189,
  },
  {
    id: "milford-sound",
    name: "Milford Sound",
    lat: -44.6167,
    lng: 167.8667,
  },
  {
    id: "manapouri",
    name: "Manapouri",
    lat: -45.5640,
    lng: 167.6080,
  },
  {
    id: "invercargill",
    name: "Invercargill",
    lat: -46.4132,
    lng: 168.3538,
  },
  {
    id: "gore",
    name: "Gore",
    lat: -46.1027,
    lng: 168.9430,
  },
  {
    id: "the-catlins-owaka",
    name: "Owaka (The Catlins)",
    lat: -46.4590,
    lng: 169.6530,
    aliases: ["Owaka", "The Catlins"],
  },

  // ---- East Coast Otago & Canterbury ----
  {
    id: "oamaru",
    name: "Ōamaru",
    lat: -45.0970,
    lng: 170.9700,
    aliases: ["Oamaru"],
  },
  {
    id: "timaru",
    name: "Timaru",
    lat: -44.3960,
    lng: 171.2536,
  },
  {
    id: "ashburton",
    name: "Ashburton",
    lat: -43.9030,
    lng: 171.7530,
  },
  {
    id: "rangiora",
    name: "Rangiora",
    lat: -43.3040,
    lng: 172.5980,
  },

  // ---- North Island: Central Plateau & Lakes ----
  {
    id: "taupo",
    name: "Taupō",
    lat: -38.6857,
    lng: 176.0702,
    aliases: ["Taupo"],
  },
  {
    id: "turangi",
    name: "Tūrangi",
    lat: -39.0080,
    lng: 175.8080,
    aliases: ["Turangi"],
  },
  {
    id: "rotorua",
    name: "Rotorua",
    lat: -38.1368,
    lng: 176.2497,
  },
  {
    id: "tauranga",
    name: "Tauranga",
    lat: -37.6878,
    lng: 176.1651,
  },
  {
    id: "mount-maunganui",
    name: "Mount Maunganui",
    lat: -37.6370,
    lng: 176.1770,
    aliases: ["Mt Maunganui", "The Mount"],
  },
  {
    id: "whakatane",
    name: "Whakatāne",
    lat: -37.9580,
    lng: 176.9840,
    aliases: ["Whakatane"],
  },
  {
    id: "cambridge",
    name: "Cambridge",
    lat: -37.8890,
    lng: 175.4690,
  },
  {
    id: "matamata",
    name: "Matamata",
    lat: -37.8100,
    lng: 175.7620,
  },

  // ---- East Coast North Island ----
  {
    id: "napier",
    name: "Napier",
    lat: -39.4928,
    lng: 176.9120,
  },
  {
    id: "hastings",
    name: "Hastings",
    lat: -39.6380,
    lng: 176.8490,
  },
  {
    id: "gisborne",
    name: "Gisborne",
    lat: -38.6623,
    lng: 178.0176,
  },

  // ---- Taranaki & Whanganui ----
  {
    id: "new-plymouth",
    name: "New Plymouth",
    lat: -39.0570,
    lng: 174.0750,
  },
  {
    id: "hawera",
    name: "Hāwera",
    lat: -39.5910,
    lng: 174.2830,
    aliases: ["Hawera"],
  },
  {
    id: "whanganui",
    name: "Whanganui",
    lat: -39.9310,
    lng: 175.0500,
    aliases: ["Wanganui"],
  },

  // ---- North of Auckland / Northland ----
  {
    id: "whangarei",
    name: "Whangārei",
    lat: -35.7250,
    lng: 174.3230,
    aliases: ["Whangarei"],
  },
  {
    id: "paihia",
    name: "Paihia",
    lat: -35.2820,
    lng: 174.0910,
  },
  {
    id: "kerikeri",
    name: "Kerikeri",
    lat: -35.2280,
    lng: 173.9470,
  },
  {
    id: "kaikohe",
    name: "Kaikohe",
    lat: -35.4070,
    lng: 173.8020,
  },
  {
    id: "kaitaia",
    name: "Kaitaia",
    lat: -35.1130,
    lng: 173.2620,
  },
  {
    id: "dargaville",
    name: "Dargaville",
    lat: -35.9330,
    lng: 173.8820,
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
