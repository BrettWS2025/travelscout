/**
 * Canonical New Zealand regions for search + operator setup.
 *
 * Source of truth is `nz_places_final.region_name` (OSM admin_level=4).
 * Names are stored in short form (without a trailing " Region"); values that
 * arrive from the DB with that suffix are normalized to match.
 */

export const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Gisborne",
  "Hawke's Bay",
  "Taranaki",
  "Manawatū-Whanganui",
  "Wellington",
  "Tasman",
  "Nelson",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Otago",
  "Southland",
] as const;

export type NzRegion = (typeof NZ_REGIONS)[number];

export function normalizeRegionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+region$/i, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareRegions(a: string, b: string): number {
  return normalizeRegionKey(a).localeCompare(normalizeRegionKey(b), "en");
}

/** Alphabetical list for pickers. */
export const NZ_REGIONS_ALPHA: readonly string[] = [...NZ_REGIONS].sort(
  compareRegions
);

const REGION_BY_KEY = new Map(
  NZ_REGIONS.map((region) => [normalizeRegionKey(region), region as string])
);

/**
 * Map a free-form / DB region string onto the canonical list.
 * Returns null when it does not match a known NZ region.
 */
export function canonicalizeRegion(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return REGION_BY_KEY.get(normalizeRegionKey(trimmed)) ?? null;
}

export function isValidRegion(value: string | null | undefined): boolean {
  return canonicalizeRegion(value) !== null;
}

/**
 * Merge DB-sourced region names into the canonical list (keeps known order,
 * appends any unexpected distinct values alphabetically for forward-compat).
 */
export function mergeRegionLists(
  fromDb: readonly string[] | null | undefined
): string[] {
  const known = new Set(NZ_REGIONS.map((r) => normalizeRegionKey(r)));
  const extras: string[] = [];

  for (const raw of fromDb ?? []) {
    const canonical = canonicalizeRegion(raw);
    if (canonical) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeRegionKey(trimmed);
    if (known.has(key)) continue;
    known.add(key);
    // Prefer short display form when DB includes "… Region"
    extras.push(trimmed.replace(/\s+Region$/i, "").trim() || trimmed);
  }

  return [...NZ_REGIONS_ALPHA, ...extras.sort(compareRegions)];
}

export function regionsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return normalizeRegionKey(a) === normalizeRegionKey(b);
}
