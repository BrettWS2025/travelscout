import type { TripPlan, TripLeg } from "@/lib/itinerary";
import type { DayDetail, DayStopMeta, RoadSectorDetail } from "@/lib/trip-planner/utils";
import type { WalkingExperience } from "@/lib/walkingExperiences";
import type { ExperienceItem } from "@/lib/viator-helpers";
import type { Event } from "@/lib/hooks/useEvents";
import type { ManualTripEntry } from "@/lib/trip-planner/utils";

export type DraftItineraryProps = {
  plan: TripPlan;
  routeStops: string[];
  nightsPerStop: number[];
  dayStopMeta: DayStopMeta[];
  dayDetails: Record<string, DayDetail>;

  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;

  openStops: Record<number, boolean>;
  onToggleStopOpen: (stopIndex: number) => void;
  onExpandAllStops: () => void;
  onCollapseAllStops: () => void;

  onChangeNights: (stopIndex: number, newValue: number) => void;
  onToggleDayOpen: (date: string, location: string) => void;
  onUpdateDayNotes: (date: string, location: string, notes: string) => void;
  onUpdateDayAccommodation: (
    date: string,
    location: string,
    accommodation: string
  ) => void;
  onRemoveExperienceFromDay?: (date: string, location: string, experienceId: string) => void;
  onRemoveEventFromDay?: (date: string, location: string, eventId: number) => void;
  onRemoveViatorProductFromDay?: (date: string, location: string, productId: string) => void;
  onEventHearted?: (event: Event, date: string, location: string) => void;
  onRequireAuth?: (event: Event, date: string, location: string) => void;

  roadSectorDetails: Record<number, RoadSectorDetail>;
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  onRemoveExperienceFromRoadSector?: (destinationStopIndex: number, experienceId: string) => void;
  startSectorType: "road" | "itinerary";
  endSectorType: "road" | "itinerary";
  onConvertStartToItinerary: () => void;
  onConvertStartToRoad: () => void;
  onConvertEndToItinerary: () => void;
  onConvertEndToRoad: () => void;

  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onRemoveStop: (stopIndex: number) => void;

  onReorderStops: (fromIndex: number, toIndex: number) => void;

  onAddToItinerary?: (
    experience: WalkingExperience | ExperienceItem,
    location: string,
    dayDate?: string,
    dayLocation?: string
  ) => void;
  
  endDate?: string; // End date of the trip (for return trip road sector date calculation)

  // Optional driving legs, used for showing dynamic distance/time on driving modules
  legs?: TripLeg[];

  onAddManualTripEntry?: (date: string, location: string, entry: ManualTripEntry) => void;
  onRemoveManualTripEntry?: (date: string, location: string, id: string) => void;
};

export type Group = {
  stopIndex: number;
  stopName: string;
  dayIndices: number[];
  startDate: string;
  endDate: string;
};
