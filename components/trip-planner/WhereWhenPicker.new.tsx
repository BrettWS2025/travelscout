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
  destinationsQuery: string;
  destinationsResults: CityLite[];

  recent: CityLite[];
  suggested: CityLite[];

  startResults: CityLite[];
  startCityId: string;
  destinationIds: string[];

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
  setDestinationsQuery: (v: string) => void;

  openMobileSheet: () => void;
  closeMobileSheet: () => void;
  openWhereDesktop: () => void;
  openWhenDesktop: () => void;

  selectStartCity: (cityId: string) => void;
  selectDestination: (cityId: string) => void;
  removeDestination: (cityId: string) => void;

  handleDateRangeChange: (range: DateRange | undefined) => void;
  setDateRange: (range: DateRange | undefined) => void;
  setCalendarMonth: (d: Date) => void;
  clearDates: () => void;

  // Modal trigger
  onOpenCityModal?: (step: "start" | "destinations" | "dates") => void;
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
  const { nearestPlace, isLoading: isGeolocating } = useGeolocation();
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDestinationsModal, setShowDestinationsModal] = useState(false);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [destinationInputs, setDestinationInputs] = useState<string[]>([""]);
  const destinationsInputRef = useRef<HTMLInputElement[]>([]);

  const startCity = getCityById(props.startCityId);
  const selectedDestinations = props.destinationIds.map((id) => getCityById(id)).filter(Boolean);
  const showBrowseLists = normalize(props.destinationsQuery).length === 0 || props.destinationsResults.length === 0;

  const handleAddDestinationInput = () => {
    setDestinationInputs([...destinationInputs, ""]);
  };

  const handleDestinationInputChange = (index: number, value: string) => {
    const newInputs = [...destinationInputs];
    newInputs[index] = value;
    setDestinationInputs(newInputs);
    props.setDestinationsQuery(value);
  };

  const handleDestinationSelect = (cityId: string) => {
    props.selectDestination(cityId);
    // Clear the input that was used
    const newInputs = destinationInputs.map((input, idx) => 
      idx === destinationInputs.length - 1 ? "" : input
    );
    setDestinationInputs(newInputs);
    props.setDestinationsQuery("");
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "Select date";
    return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-8">
      {/* Journey Start Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base text-slate-700">
              Your journey begins in{" "}
              <span className="font-semibold text-slate-900">
                {startCity ? `${startCity.name}, NZ` : "..."}
              </span>
            </span>
            <MapPin className="w-4 h-4 text-slate-500" />
          </div>
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
        </div>

        {/* Scenic Illustration Placeholder */}
        <div className="w-full h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <MapPin className="w-16 h-16 text-indigo-400 mx-auto" />
              <p className="text-slate-600 text-sm">Scenic illustration</p>
            </div>
          </div>
        </div>
      </div>

      {/* Choose your destination Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          Choose your destination
        </h2>
        
        <div className="rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 p-6 space-y-4">
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
                    onClick={() => props.removeDestination(city.id)}
                    className="hover:bg-indigo-100 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Destination inputs */}
          <div className="space-y-3">
            {destinationInputs.map((input, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <input
                    ref={(el) => {
                      if (el) destinationsInputRef.current[index] = el;
                    }}
                    type="text"
                    value={input}
                    onChange={(e) => handleDestinationInputChange(index, e.target.value)}
                    placeholder="Enter a destination..."
                    className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                {index === destinationInputs.length - 1 && (
                  <button
                    type="button"
                    onClick={handleAddDestinationInput}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Search results dropdown */}
          {props.destinationsQuery && (
            <div className="border-t border-slate-200 pt-4">
              {showBrowseLists ? (
                <div className="space-y-1">
                  {props.suggested
                    .filter((c) => !props.destinationIds.includes(c.id))
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
                  {props.destinationsResults
                    .filter((c) => !props.destinationIds.includes(c.id))
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

      {/* Pick your travel dates Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">
          Pick your travel dates
        </h2>
        
        <div className="rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 p-6">
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

      {/* Continue Button */}
      <div className="flex justify-center pt-4">
        <button
          type="button"
          className="px-8 py-4 rounded-full font-semibold text-white transition-all hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
          style={{ 
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
          }}
        >
          Continue
        </button>
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
