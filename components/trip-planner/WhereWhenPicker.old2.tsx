"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import {
  Calendar,
  MapPin,
  ChevronDown,
  Clock,
  Navigation,
  Search,
  X,
  Plus,
} from "lucide-react";
import { getCityById } from "@/lib/nzCities";
import { normalize, parseDisplayName, type CityLite } from "@/lib/trip-planner/utils";
import { useGeolocation } from "@/lib/trip-planner/hooks/useGeolocation";

type ActivePill = "start" | "destinations" | "dates" | null;

function CityIcon({ variant }: { variant: "recent" | "suggested" | "nearby" }) {
  const base =
    "w-9 h-9 rounded-xl flex items-center justify-center border border-black/5";
  if (variant === "recent") {
    return (
      <div className={`${base} bg-[#EAF7EA]`}>
        <Clock className="w-4 h-4 text-emerald-700" />
      </div>
    );
  }
  if (variant === "nearby") {
    return (
      <div className={`${base} bg-[#EAF1FF]`}>
        <Navigation className="w-4 h-4 text-blue-700" />
      </div>
    );
  }
  return (
    <div className={`${base} bg-[#F6F1EA]`}>
      <MapPin className="w-4 h-4 text-amber-700" />
    </div>
  );
}

export type WhereWhenPickerProps = {
  // refs for outside click
  whereRef: React.RefObject<HTMLDivElement>;
  whenRef: React.RefObject<HTMLDivElement>;

  // state
  activePill: ActivePill;
  showWherePopover: boolean;
  showCalendar: boolean;

  mobileSheetOpen: boolean;
  mobileActive: ActivePill;

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
  setMobileActive: (v: ActivePill) => void;
  setShowCalendar: (v: boolean) => void;
  setActivePill: (v: ActivePill) => void;

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

function WhereListItem({
  title,
  subtitle,
  onClick,
  iconVariant,
  right,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  iconVariant: "recent" | "suggested" | "nearby";
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
    >
      <CityIcon variant={iconVariant} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{title}</div>
        {subtitle ? (
          <div className="text-[12px] text-slate-600 truncate">{subtitle}</div>
        ) : null}
      </div>
      {right ? <div className="text-[12px] text-slate-600">{right}</div> : null}
    </button>
  );
}

function StartCityPanel({
  mobileSheetOpen,
  startQuery,
  setStartQuery,
  startResults,
  recent,
  suggested,
  startCityId,
  selectStartCity,
  nearestPlace,
  isGeolocating,
}: {
  mobileSheetOpen: boolean;
  startQuery: string;
  setStartQuery: (v: string) => void;
  startResults: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  startCityId: string;
  selectStartCity: (id: string) => void;
  nearestPlace: any;
  isGeolocating: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const showBrowseLists = normalize(startQuery).length === 0 || startResults.length === 0;

  useEffect(() => {
    const suggestionsEl = suggestionsRef.current;
    if (!suggestionsEl) return;

    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };

    const handleTouchMove = () => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    };

    suggestionsEl.addEventListener("scroll", handleScroll);
    suggestionsEl.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      suggestionsEl.removeEventListener("scroll", handleScroll);
      suggestionsEl.removeEventListener("touchmove", handleTouchMove);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-white">
            {mobileSheetOpen ? "Start" : "Your journey starts here"}
          </div>
          {!mobileSheetOpen && (
            <div className="text-[11px] text-gray-300">
              {isGeolocating
                ? "Detecting your location..."
                : nearestPlace
                ? "We've detected your location. You can change it below."
                : "Type to search, or pick a suggestion."}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100/50 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={startQuery}
          onChange={(e) => setStartQuery(e.target.value)}
          autoFocus={!mobileSheetOpen}
          placeholder="Search destinations"
          className="w-full bg-transparent outline-none text-base md:text-sm placeholder:text-slate-400 text-slate-800 no-zoom-mobile"
        />
      </div>

      <div
        ref={suggestionsRef}
        className={`overflow-auto pr-1 ${
          mobileSheetOpen
            ? "max-h-[calc(100dvh-280px)]"
            : "max-h-[52vh]"
        }`}
      >
        {showBrowseLists ? (
          <>
            {nearestPlace && !startCityId && (
              <div className="mb-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Your location
                </div>
                <WhereListItem
                  title={nearestPlace.name}
                  subtitle="Detected from your location"
                  iconVariant="nearby"
                  onClick={() => selectStartCity(nearestPlace.id)}
                />
              </div>
            )}

            {recent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {recent.map((c) => {
                    const { cityName, district } = parseDisplayName(c.name);
                    return (
                      <WhereListItem
                        key={`start-recent-${c.id}`}
                        title={cityName || c.name.split(',')[0].trim()}
                        subtitle={district || undefined}
                        iconVariant="recent"
                        onClick={() => selectStartCity(c.id)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-2">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                Suggested destinations
              </div>
              <div className="space-y-1">
                {suggested.map((c) => (
                  <WhereListItem
                    key={`start-suggested-${c.id}`}
                    title={c.name}
                    subtitle="Top departure"
                    iconVariant="suggested"
                    onClick={() => selectStartCity(c.id)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {startResults.length > 0 && (
              <>
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Matches
                </div>
                <div className="space-y-1">
                  {startResults.map((c) => (
                    <WhereListItem
                      key={`start-match-${c.id}`}
                      title={c.cityName || c.name.split(',')[0].trim()}
                      subtitle={c.district || undefined}
                      iconVariant="suggested"
                      onClick={() => selectStartCity(c.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DestinationsPanel({
  mobileSheetOpen,
  destinationsQuery,
  setDestinationsQuery,
  destinationsResults,
  recent,
  suggested,
  destinationIds,
  selectDestination,
  removeDestination,
}: {
  mobileSheetOpen: boolean;
  destinationsQuery: string;
  setDestinationsQuery: (v: string) => void;
  destinationsResults: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  destinationIds: string[];
  selectDestination: (id: string) => void;
  removeDestination: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const showBrowseLists = normalize(destinationsQuery).length === 0 || destinationsResults.length === 0;

  useEffect(() => {
    const suggestionsEl = suggestionsRef.current;
    if (!suggestionsEl) return;

    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };

    const handleTouchMove = () => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    };

    suggestionsEl.addEventListener("scroll", handleScroll);
    suggestionsEl.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      suggestionsEl.removeEventListener("scroll", handleScroll);
      suggestionsEl.removeEventListener("touchmove", handleTouchMove);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const selectedDestinations = destinationIds.map((id) => getCityById(id)).filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-white">
            {mobileSheetOpen ? "Destinations" : "Where are you going?"}
          </div>
          {!mobileSheetOpen && (
            <div className="text-[11px] text-gray-300">
              Add as many places as you want to visit.
            </div>
          )}
        </div>
      </div>

      {selectedDestinations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDestinations.map((city) => (
            <div
              key={city.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 text-sm text-slate-800"
            >
              <span>{city.name}</span>
              <button
                type="button"
                onClick={() => removeDestination(city.id)}
                className="hover:bg-slate-100 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100/50 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={destinationsQuery}
          onChange={(e) => setDestinationsQuery(e.target.value)}
          autoFocus={!mobileSheetOpen && selectedDestinations.length === 0}
          placeholder="Search destinations"
          className="w-full bg-transparent outline-none text-base md:text-sm placeholder:text-slate-400 text-slate-800 no-zoom-mobile"
        />
      </div>

      <div
        ref={suggestionsRef}
        className={`overflow-auto pr-1 ${
          mobileSheetOpen
            ? "max-h-[calc(100dvh-280px)]"
            : "max-h-[52vh]"
        }`}
      >
        {showBrowseLists ? (
          <>
            {recent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {recent
                    .filter((c) => !destinationIds.includes(c.id))
                    .map((c) => {
                      const { cityName, district } = parseDisplayName(c.name);
                      return (
                        <WhereListItem
                          key={`dest-recent-${c.id}`}
                          title={cityName || c.name.split(',')[0].trim()}
                          subtitle={district || undefined}
                          iconVariant="recent"
                          onClick={() => selectDestination(c.id)}
                        />
                      );
                    })}
                </div>
              </div>
            )}

            <div className="mb-2">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                Suggested destinations
              </div>
              <div className="space-y-1">
                {suggested
                  .filter((c) => !destinationIds.includes(c.id))
                  .map((c) => (
                    <WhereListItem
                      key={`dest-suggested-${c.id}`}
                      title={c.name}
                      subtitle="Top destination"
                      iconVariant="suggested"
                      onClick={() => selectDestination(c.id)}
                    />
                  ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {destinationsResults
              .filter((c) => !destinationIds.includes(c.id))
              .length > 0 && (
              <>
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Matches
                </div>
                <div className="space-y-1">
                  {destinationsResults
                    .filter((c) => !destinationIds.includes(c.id))
                    .map((c) => (
                      <WhereListItem
                        key={`dest-match-${c.id}`}
                        title={c.cityName || c.name.split(',')[0].trim()}
                        subtitle={c.district || undefined}
                        iconVariant="suggested"
                        onClick={() => selectDestination(c.id)}
                      />
                    ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function WhereWhenPicker(props: WhereWhenPickerProps) {
  const { nearestPlace, isLoading: isGeolocating } = useGeolocation();

  return (
    <>
      {/* MOBILE: three separate pills stacked */}
      <div className="md:hidden space-y-3">
        {/* START pill */}
        <div ref={props.whereRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("start");
              } else {
                props.openMobileSheet();
                props.setMobileActive("start");
              }
            }}
            className="w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] transition-all duration-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin className="w-4 h-4 opacity-80" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  Your journey starts here
                </div>
                <div className="text-sm font-medium truncate">
                  {props.startSummary}
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 opacity-70" />
          </button>
        </div>

        {/* DESTINATIONS pill */}
        <div ref={props.whereRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("destinations");
              } else {
                props.openMobileSheet();
                props.setMobileActive("destinations");
              }
            }}
            className="w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] transition-all duration-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin className="w-4 h-4 opacity-80" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  Where are you going
                </div>
                <div className="text-sm font-medium truncate">
                  {props.destinationsSummary}
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 opacity-70" />
          </button>
        </div>

        {/* WHEN pill */}
        <div ref={props.whenRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("dates");
              } else {
                props.openMobileSheet();
                props.setMobileActive("dates");
              }
            }}
            className="w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] transition-all duration-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Calendar className="w-4 h-4 opacity-80" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  What dates are you travelling?
                </div>
                <div className="text-sm font-medium truncate">
                  {props.whenLabel}
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 opacity-70" />
          </button>
        </div>
      </div>

      {/* DESKTOP: three pills stacked */}
      <div className="relative hidden md:block space-y-3">
        {/* START pill */}
        <div ref={props.whereRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("start");
              } else {
                props.openWhereDesktop();
              }
            }}
            className={[
              "w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 text-left",
              "hover:bg-slate-50/50 transition-all duration-200 flex items-center justify-between gap-3",
              props.activePill === "start" ? "bg-slate-50/50" : "",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                Your journey starts here
              </div>
              <div className="text-sm truncate">{props.startSummary}</div>
            </div>
            <div className="flex items-center gap-2 opacity-80">
              <MapPin className="w-4 h-4" />
              <ChevronDown className="w-4 h-4" />
            </div>
          </button>

          {props.showWherePopover && props.activePill === "start" && (
            <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-slate-100/50">
              <StartCityPanel
                mobileSheetOpen={false}
                startQuery={props.startQuery}
                setStartQuery={props.setStartQuery}
                startResults={props.startResults}
                recent={props.recent}
                suggested={props.suggested}
                startCityId={props.startCityId}
                selectStartCity={props.selectStartCity}
                nearestPlace={nearestPlace}
                isGeolocating={isGeolocating}
              />
            </div>
          )}
        </div>

        {/* DESTINATIONS pill */}
        <div ref={props.whereRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("destinations");
              } else {
                props.openWhereDesktop();
              }
            }}
            className={[
              "w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 text-left",
              "hover:bg-slate-50/50 transition-all duration-200 flex items-center justify-between gap-3",
              props.activePill === "destinations" ? "bg-slate-50/50" : "",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                Where are you going
              </div>
              <div className="text-sm truncate">{props.destinationsSummary}</div>
            </div>
            <div className="flex items-center gap-2 opacity-80">
              <MapPin className="w-4 h-4" />
              <ChevronDown className="w-4 h-4" />
            </div>
          </button>

          {props.showWherePopover && props.activePill === "destinations" && (
            <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-slate-100/50">
              <DestinationsPanel
                mobileSheetOpen={false}
                destinationsQuery={props.destinationsQuery}
                setDestinationsQuery={props.setDestinationsQuery}
                destinationsResults={props.destinationsResults}
                recent={props.recent}
                suggested={props.suggested}
                destinationIds={props.destinationIds}
                selectDestination={props.selectDestination}
                removeDestination={props.removeDestination}
              />
            </div>
          )}
        </div>

        {/* WHEN pill */}
        <div ref={props.whenRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (props.onOpenCityModal) {
                props.onOpenCityModal("dates");
              } else {
                props.openWhenDesktop();
              }
            }}
            className={[
              "w-full rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 px-4 py-3 text-left",
              "hover:bg-slate-50/50 transition-all duration-200 flex items-center justify-between gap-3",
              props.activePill === "dates" ? "bg-slate-50/50" : "",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                What dates are you travelling?
              </div>
              <div className="text-sm truncate">{props.whenLabel}</div>
            </div>
            <Calendar className="w-4 h-4 opacity-80" />
          </button>

          {props.showCalendar && (
            <div
              className={[
                "absolute left-0 mt-3 z-30 rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-slate-100/50",
                "overflow-hidden w-[360px] p-3",
              ].join(" ")}
            >
              <div className="px-2 pb-2">
                <p className="text-[11px] text-slate-600">
                  Pick your start date.
                </p>
              </div>

              <div className="overflow-x-auto">
                <DayPicker
                  mode="single"
                  selected={props.dateRange?.from}
                  onSelect={(date) => {
                    if (date) {
                      props.handleDateRangeChange({ from: date, to: undefined });
                    }
                  }}
                  numberOfMonths={1}
                  weekStartsOn={1}
                  month={props.calendarMonth}
                  onMonthChange={props.setCalendarMonth}
                />
              </div>

              <div className="flex justify-between items-center mt-2 px-2">
                <button
                  type="button"
                  className="text-[11px] text-slate-600 hover:text-indigo-600 underline underline-offset-2"
                  onClick={props.clearDates}
                >
                  Clear
                </button>

                <button
                  type="button"
                  className="text-[11px] text-slate-600 hover:text-indigo-600 underline underline-offset-2"
                  onClick={() => {
                    props.setShowCalendar(false);
                    props.setActivePill(null);
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE SHEET */}
      {props.mobileSheetOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/55"
            onClick={props.closeMobileSheet}
          />
          <div className="absolute left-0 right-0 bottom-0 rounded-t-3xl bg-white border-t border-slate-100/50 shadow-[0_-4px_24px_rgba(0,0,0,0.15)]">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">
                  Start your Journey
                </div>
                <button
                  type="button"
                  onClick={props.closeMobileSheet}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-slate-700" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => props.setMobileActive("start")}
                  className={[
                    "w-full px-4 py-3 flex items-center justify-between",
                    props.mobileActive === "start" ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  <div className="text-left">
                    <div className="text-[11px] text-slate-600">Your journey starts here</div>
                    <div className="text-sm text-slate-800">{props.startSummary}</div>
                  </div>
                  <MapPin className="w-4 h-4 text-slate-500" />
                </button>

                <div className="h-px bg-slate-200" />

                <button
                  type="button"
                  onClick={() => props.setMobileActive("destinations")}
                  className={[
                    "w-full px-4 py-3 flex items-center justify-between",
                    props.mobileActive === "destinations" ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  <div className="text-left">
                    <div className="text-[11px] text-slate-600">Where are you going</div>
                    <div className="text-sm text-slate-800">{props.destinationsSummary}</div>
                  </div>
                  <MapPin className="w-4 h-4 text-slate-500" />
                </button>

                <div className="h-px bg-slate-200" />

                <button
                  type="button"
                  onClick={() => {
                    if (props.onOpenCityModal) {
                      props.onOpenCityModal("dates");
                      props.closeMobileSheet();
                    } else {
                      props.setMobileActive("dates");
                    }
                  }}
                  className={[
                    "w-full px-4 py-3 flex items-center justify-between",
                    props.mobileActive === "dates" ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  <div className="text-left">
                    <div className="text-[11px] text-slate-600">What dates are you travelling?</div>
                    <div className="text-sm text-slate-800">{props.whenLabel}</div>
                  </div>
                  <Calendar className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="mt-4">
                {props.mobileActive === "start" ? (
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 border border-slate-200 p-4">
                    <StartCityPanel
                      mobileSheetOpen
                      startQuery={props.startQuery}
                      setStartQuery={props.setStartQuery}
                      startResults={props.startResults}
                      recent={props.recent}
                      suggested={props.suggested}
                      startCityId={props.startCityId}
                      selectStartCity={props.selectStartCity}
                      nearestPlace={nearestPlace}
                      isGeolocating={isGeolocating}
                    />
                  </div>
                ) : props.mobileActive === "destinations" ? (
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 border border-slate-200 p-4">
                    <DestinationsPanel
                      mobileSheetOpen
                      destinationsQuery={props.destinationsQuery}
                      setDestinationsQuery={props.setDestinationsQuery}
                      destinationsResults={props.destinationsResults}
                      recent={props.recent}
                      suggested={props.suggested}
                      destinationIds={props.destinationIds}
                      selectDestination={props.selectDestination}
                      removeDestination={props.removeDestination}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
                    <div className="p-2">
                      <DayPicker
                        mode="single"
                        selected={props.dateRange?.from}
                        onSelect={(date) => {
                          if (date) {
                            props.handleDateRangeChange({ from: date, to: undefined });
                          }
                        }}
                        numberOfMonths={1}
                        weekStartsOn={1}
                        month={props.calendarMonth}
                        onMonthChange={props.setCalendarMonth}
                      />
                    </div>

                    <div className="flex justify-between items-center px-3 pb-3">
                      <button
                        type="button"
                        className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                        onClick={props.clearDates}
                      >
                        Clear
                      </button>

                      <button
                        type="button"
                        className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                        onClick={props.closeMobileSheet}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
