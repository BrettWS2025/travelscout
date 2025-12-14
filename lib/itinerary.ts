// lib/itinerary.ts
export type TripInput = {
  startCity: string;
  endCity: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  waypoints: string[]; // e.g. ["Lake Tekapo", "Dunedin", "Milford Sound"]
};

export type TripDay = {
  dayNumber: number;
  date: string;
  location: string;
};

export type TripPlan = {
  days: TripDay[];
};

export function buildSimpleTripPlan(input: TripInput): TripPlan {
  // super basic V1:
  //  - total number of days from startDate to endDate
  //  - roughly distribute them over startCity + waypoints + endCity in order
  //  - return a list of TripDay objects
  // (We can make this smarter later.)
  return {
    days: [],
  };
}
