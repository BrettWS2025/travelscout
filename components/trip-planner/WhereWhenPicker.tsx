"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import {
  Calendar,
  MapPin,
  ChevronRight,
  Search,
  X,
  Plus,
  Edit3,
  RefreshCw,
} from "lucide-react";
import { getCityById } from "@/lib/nzCities";
import { normalize, parseDisplayName, type CityLite } from "@/lib/trip-planner/utils";
import { useGeolocation } from "@/lib/trip-planner/hooks/useGeolocation";

export type WhereWhenPickerProps = {
  // refs for outside click
  whereRef: React.RefObject<HTMLDivElement>;
  whenRef: React.RefObject<HTMLDivElement>;

  // state
  activePill: any;
  showWherePopover: boolean;
  showCalendar: boolean;

  mobileSheetOpen: boolean;
  mobileActive: any;

  startQuery: string;
  endQuery: string;
  destinationsQuery?: string;
  destinationsResults?: CityLite[];

  recent: CityLite[];
  suggested: CityLite[];

  startResults: CityLite[];
  endResults: CityLite[];
  startCityId: string;
  endCityId: string;
  destinationIds?: string[];

  // date state
  dateRange: DateRange | undefined;
  calendarMonth: Date;

  // labels
  startSummary: string;
  destinationsSummary: string;
  whenLabel: string;

  // setters / actions
  setMobileActive: (v: any) => void;
  setShowCalendar: (v: boolean) => void;
  setActivePill: (v: any) => void;

  setStartQuery: (v: string) => void;
  setEndQuery: (v: string) => void;
  setDestinationsQuery?: (v: string) => void;

  openMobileSheet: () => void;
  closeMobileSheet: () => void;
  openWhereDesktop: () => void;
  openWhenDesktop: () => void;

  selectStartCity: (cityId: string) => void;
  selectEndCity: (cityId: string) => void;
  selectDestination?: (cityId: string) => void;
  removeDestination?: (cityId: string) => void;

  handleDateRangeChange: (range: DateRange | undefined) => void;
  setDateRange: (range: DateRange | undefined) => void;
  setCalendarMonth: (d: Date) => void;
  clearDates: () => void;

  // Modal trigger
  onOpenCityModal?: (step: "start" | "destinations" | "dates") => void;
  // Return question trigger
  onOpenReturnQuestion?: () => void;
};

function DestinationListItem({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition"
    >
      <MapPin className="w-4 h-4 text-slate-500" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{title}</div>
        {subtitle ? (
          <div className="text-xs text-slate-600 truncate">{subtitle}</div>
        ) : null}
      </div>
    </button>
  );
}

export default function WhereWhenPicker(props: WhereWhenPickerProps) {
  const { nearestPlace, isLoading: isGeolocating, isOutsideNZ } = useGeolocation();
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [destinationInput, setDestinationInput] = useState("");

  const startCity = getCityById(props.startCityId);
  const endCity = getCityById(props.endCityId);
  const isReturnTrip = startCity && endCity && props.startCityId === props.endCityId;
  
  // Show shimmer if geolocating and not outside NZ
  const showShimmer = isGeolocating && !isOutsideNZ && !startCity;

  // Auto-select nearest place if detected and no start city is selected
  useEffect(() => {
    if (nearestPlace && !props.startCityId && !isGeolocating) {
      // Auto-select the nearest place as start city and default to return trip
      const autoSelect = async () => {
        await props.selectStartCity(nearestPlace.id);
        // Default to return trip: automatically set end city to start city
        if (props.selectEndCity) {
          await props.selectEndCity(nearestPlace.id);
        }
      };
      autoSelect();
    }
  }, [nearestPlace, props.startCityId, isGeolocating, props.selectStartCity, props.selectEndCity]);
  // Use destinationIds if available, otherwise use endCityId as single destination
  const destinationIds = props.destinationIds || (props.endCityId ? [props.endCityId] : []);
  const selectedDestinations = destinationIds.map((id) => getCityById(id)).filter(Boolean);
  const destinationsQuery = props.destinationsQuery || props.endQuery || "";
  const destinationsResults = props.destinationsResults || props.endResults || [];
  const showBrowseLists = normalize(destinationsQuery).length === 0 || destinationsResults.length === 0;

  const handleDestinationInputChange = (value: string) => {
    setDestinationInput(value);
    if (props.setDestinationsQuery) {
      props.setDestinationsQuery(value);
    } else {
      props.setEndQuery(value);
    }
  };

  const handleDestinationSelect = (cityId: string) => {
    if (props.selectDestination) {
      props.selectDestination(cityId);
    } else {
      props.selectEndCity(cityId);
    }
    setDestinationInput("");
    if (props.setDestinationsQuery) {
      props.setDestinationsQuery("");
    } else {
      props.setEndQuery("");
    }
  };

  const handleRemoveDestination = (cityId: string) => {
    if (props.removeDestination) {
      props.removeDestination(cityId);
    } else if (props.endCityId === cityId) {
      props.selectEndCity("");
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "Select date";
    return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-8">
      {/* Journey Start Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          {startCity ? (
            <>
              <span className="text-base text-slate-700">
                Your journey begins in{" "}
                <span className="font-semibold text-slate-900">
                  {startCity.name}, NZ
                </span>
              </span>
              <MapPin className="w-4 h-4 text-slate-500" />
              {isReturnTrip && (
                <button
                  type="button"
                  onClick={() => {
                    if (props.onOpenReturnQuestion) {
                      props.onOpenReturnQuestion();
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 transition"
                  title="Returning to start location"
                >
                  <RefreshCw className="w-4 h-4 text-indigo-600" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (props.onOpenCityModal) {
                    props.onOpenCityModal("start");
                  } else {
                    setShowStartModal(true);
                  }
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2"
              >
                Change now
              </button>
            </>
          ) : showShimmer ? (
            <div className="flex items-center gap-2">
              <span className="text-base text-slate-700 animate-pulse">
                Your journey begins
                <span className="inline-block w-8 ml-1 text-xl">
                  <span className="inline-block animate-[pulse_1.4s_ease-in-out_infinite]">.</span>
                  <span className="inline-block animate-[pulse_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }}>.</span>
                  <span className="inline-block animate-[pulse_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }}>.</span>
                </span>
              </span>
            </div>
          ) : (
            <>
              <span className="text-base text-slate-700">
                Where are you starting your journey from?
              </span>
              <button
                type="button"
                onClick={() => {
                  if (props.onOpenCityModal) {
                    props.onOpenCityModal("start");
                  } else {
                    setShowStartModal(true);
                  }
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2"
              >
                Choose now
              </button>
            </>
          )}
        </div>

      </div>

      {/* Where are you going? Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          Where are you going?
        </h2>
        
        <div className="space-y-4">
          {/* Selected destinations */}
          {selectedDestinations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedDestinations.map((city) => (
                <div
                  key={city.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-sm text-indigo-900 border border-indigo-200"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{city.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDestination(city.id)}
                    className="hover:bg-indigo-100 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Destination input */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={destinationInput}
                  onChange={(e) => handleDestinationInputChange(e.target.value)}
                  placeholder="Enter a destination..."
                  className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setDestinationInput("");
                  props.setDestinationsQuery("");
                }}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search results dropdown */}
          {props.destinationsQuery && (
            <div className="border-t border-slate-200 pt-4">
              {showBrowseLists ? (
                <div className="space-y-1">
                  {props.suggested
                    .filter((c) => !destinationIds.includes(c.id))
                    .slice(0, 5)
                    .map((c) => {
                      const { cityName, district } = parseDisplayName(c.name);
                      return (
                        <DestinationListItem
                          key={c.id}
                          title={cityName || c.name.split(',')[0].trim()}
                          subtitle={district || undefined}
                          onClick={() => handleDestinationSelect(c.id)}
                        />
                      );
                    })}
                </div>
              ) : (
                <div className="space-y-1">
                  {destinationsResults
                    .filter((c) => !destinationIds.includes(c.id))
                    .slice(0, 5)
                    .map((c) => (
                      <DestinationListItem
                        key={c.id}
                        title={c.cityName || c.name.split(',')[0].trim()}
                        subtitle={c.district || undefined}
                        onClick={() => handleDestinationSelect(c.id)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* What dates are you travelling? Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          What dates are you travelling?
        </h2>
        
        <div>
          <div className="flex items-center gap-4">
            {/* Start Date */}
            <button
              type="button"
              onClick={() => {
                if (props.onOpenCityModal) {
                  props.onOpenCityModal("dates");
                } else {
                  setShowDatesModal(true);
                }
              }}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition cursor-pointer"
            >
              <Calendar className="w-5 h-5 text-slate-500" />
              <div className="flex-1 text-left">
                <div className="text-xs text-slate-500 mb-1">Start Date</div>
                <div className="text-sm font-medium text-slate-900">
                  {formatDate(props.dateRange?.from)}
                </div>
              </div>
            </button>

            <ChevronRight className="w-5 h-5 text-slate-400" />

            {/* End Date */}
            <button
              type="button"
              onClick={() => {
                if (props.onOpenCityModal) {
                  props.onOpenCityModal("dates");
                } else {
                  setShowDatesModal(true);
                }
              }}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition cursor-pointer"
            >
              <Calendar className="w-5 h-5 text-slate-500" />
              <div className="flex-1 text-left">
                <div className="text-xs text-slate-500 mb-1">End Date</div>
                <div className="text-sm font-medium text-slate-900">
                  {formatDate(props.dateRange?.to)}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Date Picker Modal */}
      {showDatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Select Dates</h3>
              <button
                type="button"
                onClick={() => setShowDatesModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <DayPicker
              mode="range"
              selected={props.dateRange}
              onSelect={props.handleDateRangeChange}
              numberOfMonths={1}
              weekStartsOn={1}
              month={props.calendarMonth}
              onMonthChange={props.setCalendarMonth}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={props.clearDates}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowDatesModal(false)}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
