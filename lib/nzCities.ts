// lib/nzCities.ts

export type NzCity = {
  id: string; // short code, typically IATA in lowercase (e.g. "akl")
  name: string; // display name
  lat: number;
  lng: number;

  /**
   * Optional UI ranking for suggestions / ordering.
   * Lower = more prominent (e.g. 1 is top suggested).
   */
  rank?: number;
};

export const NZ_CITIES: NzCity[] = [
  // --- Major internationals ---
  {
    id: "akl",
    name: "Auckland",
    lat: -36.850886,
    lng: 174.764509,
    rank: 1,
  },
  {
    id: "wlg",
    name: "Wellington",
    lat: -41.276878,
    lng: 174.773146,
    rank: 2,
  },
  {
    id: "chc",
    name: "Christchurch",
    lat: -43.532043,
    lng: 172.630606,
    rank: 3,
  },
  {
    id: "zqn",
    name: "Queenstown",
    lat: -45.03023,
    lng: 168.66271,
    rank: 4,
  },
  {
    id: "dud",
    name: "Dunedin",
    lat: -45.8742,
    lng: 170.5036,
    rank: 9,
  },

  // --- North Island regionals ---
  {
    id: "hlz",
    name: "Hamilton",
    lat: -37.7833,
    lng: 175.2833,
    rank: 6,
  },
  {
    id: "trg",
    name: "Tauranga",
    lat: -37.6869,
    lng: 176.1653,
    rank: 7,
  },
  {
    id: "rot",
    name: "Rotorua",
    lat: -38.1381,
    lng: 176.2529,
    rank: 10,
  },
  {
    id: "gis",
    name: "Gisborne",
    lat: -38.6623,
    lng: 178.0176,
  },
  {
    id: "npe",
    name: "Napier",
    lat: -39.4928,
    lng: 176.912,
    rank: 12,
  },
  {
    id: "npl",
    name: "New Plymouth",
    lat: -39.057,
    lng: 174.075,
  },
  {
    id: "pmr",
    name: "Palmerston North",
    lat: -40.3564,
    lng: 175.611,
  },
  {
    id: "tuo",
    name: "Taupō",
    lat: -38.6857,
    lng: 176.0702,
  },
  {
    id: "wag",
    name: "Whanganui",
    lat: -39.931,
    lng: 175.05,
  },
  {
    id: "whk",
    name: "Whakatāne",
    lat: -37.958,
    lng: 176.984,
  },
  {
    id: "wre",
    name: "Whangārei",
    lat: -35.725,
    lng: 174.323,
  },
  {
    id: "kke",
    name: "Kerikeri",
    lat: -35.228,
    lng: 173.947,
  },
  {
    id: "kat",
    name: "Kaitaia",
    lat: -35.113,
    lng: 173.262,
  },

  // --- South Island regionals ---
  {
    id: "nsn",
    name: "Nelson",
    lat: -41.2706,
    lng: 173.284,
    rank: 11,
  },
  {
    id: "bhe",
    name: "Blenheim",
    lat: -41.5134,
    lng: 173.9612,
  },
  {
    id: "hkk",
    name: "Hokitika",
    lat: -42.7167,
    lng: 170.9667,
  },
  {
    id: "ivc",
    name: "Invercargill",
    lat: -46.4132,
    lng: 168.3538,
  },
  {
    id: "tiu",
    name: "Timaru",
    lat: -44.396,
    lng: 171.2536,
  },
];

// Handy defaults for the UI
export const DEFAULT_START_CITY_ID = "chc"; // Christchurch
export const DEFAULT_END_CITY_ID = "zqn"; // Queenstown

export function getCityById(id: string): NzCity | undefined {
  return NZ_CITIES.find((c) => c.id === id);
}
