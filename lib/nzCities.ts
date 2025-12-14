// lib/nzCities.ts

export type NzCity = {
  id: string;      // short code
  name: string;    // display name
  lat: number;
  lng: number;
};

export const NZ_CITIES: NzCity[] = [
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
];

// Handy defaults for the UI
export const DEFAULT_START_CITY_ID = "chc"; // Christchurch
export const DEFAULT_END_CITY_ID = "zqn";   // Queenstown

export function getCityById(id: string): NzCity | undefined {
  return NZ_CITIES.find((c) => c.id === id);
}
