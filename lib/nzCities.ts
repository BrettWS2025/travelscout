// lib/nzCities.ts

export type NzCity = {
  id: string;   // short code, typically IATA in lowercase (e.g. "akl")
  name: string; // display name
  lat: number;
  lng: number;
};

export const NZ_CITIES: NzCity[] = [
  // --- Major internationals ---
  {
    id: "akl",
    name: "Auckland",
    lat: -36.850886,
    lng: 174.764509,
  },
  {
    id: "wlg",
    name: "Wellington",
    lat: -41.276878,
    lng: 174.773146,
  },
  {
    id: "chc",
    name: "Christchurch",
    lat: -43.532043,
    lng: 172.630606,
  },
  {
    id: "zqn",
    name: "Queenstown",
    lat: -45.03023,
    lng: 168.66271,
  },
  {
    id: "dud",
    name: "Dunedin",
    lat: -45.8742,
    lng: 170.5036,
  },

  // --- North Island regionals ---
  {
    id: "hlz",
    name: "Hamilton",
    lat: -37.7833,
    lng: 175.2833,
  },
  {
    id: "trg",
    name: "Tauranga",
    lat: -37.6869,
    lng: 176.1653,
  },
  {
    id: "rot",
    name: "Rotorua",
    lat: -38.1381,
    lng: 176.2529,
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
    lng: 176.9120,
  },
  {
    id: "npl",
    name: "New Plymouth",
    lat: -39.0570,
    lng: 174.0750,
  },
  {
    id: "pmr",
    name: "Palmerston North",
    lat: -40.3564,
    lng: 175.6110,
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
    lat: -39.9310,
    lng: 175.0500,
  },
  {
    id: "whk",
    name: "Whakatāne",
    lat: -37.9580,
    lng: 176.9840,
  },
  {
    id: "wre",
    name: "Whangārei",
    lat: -35.7250,
    lng: 174.3230,
  },
  {
    id: "kke",
    name: "Kerikeri",
    lat: -35.2280,
    lng: 173.9470,
  },
  {
    id: "kat",
    name: "Kaitaia",
    lat: -35.1130,
    lng: 173.2620,
  },

  // --- South Island regionals ---
  {
    id: "nsn",
    name: "Nelson",
    lat: -41.2706,
    lng: 173.2840,
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
    lat: -44.3960,
    lng: 171.2536,
  },
];

// Handy defaults for the UI
export const DEFAULT_START_CITY_ID = "chc"; // Christchurch
export const DEFAULT_END_CITY_ID = "zqn";   // Queenstown

export function getCityById(id: string): NzCity | undefined {
  return NZ_CITIES.find((c) => c.id === id);
}
