"use client";

import type React from "react";
import { useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import {
  Calendar,
  MapPin,
  ChevronDown,
  Clock,
  ArrowLeftRight,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { NZ_CITIES, getCityById } from "@/lib/nzCities";
import { normalize, type CityLite } from "@/lib/trip-planner/utils";

type ActivePill = "where" | "when" | null;

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
  // ✅ refs for outside click (owned by hook)
  // NOTE: RefObject<HTMLDivElement> already includes `current: HTMLDivElement | null`
  whereRef: React.RefObject<HTMLDivElement>;
  whenRef: React.RefObject<HTMLDivElement>;

  // state
  activePill: ActivePill;
  showWherePopover: boolean;
  showCalendar: boolean;

  mobileSheetOpen: boolean;
  mobileActive: ActivePill;

  whereStep: "start" | "end";
  startQuery: string;
  endQuery: string;

  recent: CityLite[];
  suggested: CityLite[];

  startResults: CityLite[];
  endResults: CityLite[];

  startCityId: string;
  endCityId: string;

  // date state
  dateRange: DateRange | undefined;
  calendarMonth: Date;

  // labels
  whereSummary: string;
  whenLabel: string;
  totalTripDays: number;

  // setters / actions
  setMobileActive: (v: ActivePill) => void;
  setShowCalendar: (v: boolean) => void;
  setActivePill: (v: ActivePill) => void;

  setStartQuery: (v: string) => void;
  setEndQuery: (v: string) => void;

  openMobileSheet: () => void;
  closeMobileSheet: () => void;
  openWhereDesktop: () => void;
  openWhenDesktop: () => void;

  selectStartCity: (cityId: string) => void;
  selectEndCity: (cityId: string) => void;
  selectReturnToStart: () => void;

  setWhereStep: (step: "start" | "end") => void;

  handleDateRangeChange: (range: DateRange | undefined) => void;
  setDateRange: (range: DateRange | undefined) => void;
  setCalendarMonth: (d: Date) => void;
  clearDates: () => void;
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

function WherePickerPanel({
  step,
  mobileSheetOpen,
  startQuery,
  setStartQuery,
  endQuery,
  setEndQuery,
  startResults,
  endResults,
  recent,
  suggested,
  startCityId,
  selectStartCity,
  selectEndCity,
  selectReturnToStart,
}: {
  step: "start" | "end";
  mobileSheetOpen: boolean;
  startQuery: string;
  setStartQuery: (v: string) => void;
  endQuery: string;
  setEndQuery: (v: string) => void;
  startResults: CityLite[];
  endResults: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  startCityId: string;
  selectStartCity: (id: string) => void;
  selectEndCity: (id: string) => void;
  selectReturnToStart: () => void;
}) {
  const isStart = step === "start";
  const query = isStart ? startQuery : endQuery;
  const setQuery = isStart ? setStartQuery : setEndQuery;
  const results = isStart ? startResults : endResults;
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const showBrowseLists = normalize(query).length === 0;
  const startCity = getCityById(startCityId);

  // Blur input on suggestions list scroll/touchmove
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
            {mobileSheetOpen
              ? "Where?"
              : isStart
              ? "Where are you starting?"
              : "Where are you finishing?"}
          </div>
          {!mobileSheetOpen && (
            <div className="text-[11px] text-gray-300">
              Type to search, or pick a suggestion.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={!mobileSheetOpen}
          placeholder="Search destinations"
          className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400 text-slate-800 md:text-sm"
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
        {!isStart && startCity && (
          <div className="mb-3">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
              Quick option
            </div>
            <WhereListItem
              title="Return to start city"
              subtitle={`Finish in ${startCity.name}`}
              iconVariant="suggested"
              right={<ArrowLeftRight className="w-4 h-4 opacity-80" />}
              onClick={selectReturnToStart}
            />
          </div>
        )}

        {showBrowseLists ? (
          <>
            {recent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {recent.map((c) => (
                    <WhereListItem
                      key={`${step}-recent-${c.id}`}
                      title={c.name}
                      subtitle={
                        isStart
                          ? "Recently used start city"
                          : "Recently used destination"
                      }
                      iconVariant="recent"
                      onClick={() =>
                        isStart ? selectStartCity(c.id) : selectEndCity(c.id)
                      }
                    />
                  ))}
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
                    key={`${step}-suggested-${c.id}`}
                    title={c.name}
                    subtitle={isStart ? "Top departure" : "Top destination"}
                    iconVariant="suggested"
                    onClick={() =>
                      isStart ? selectStartCity(c.id) : selectEndCity(c.id)
                    }
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
              Matches
            </div>
            {results.length === 0 ? (
              <div className="px-2 py-3 text-sm text-gray-300">
                No matches. Try a different spelling.
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((c) => (
                  <WhereListItem
                    key={`${step}-match-${c.id}`}
                    title={c.name}
                    subtitle="New Zealand"
                    iconVariant="suggested"
                    onClick={() =>
                      isStart ? selectStartCity(c.id) : selectEndCity(c.id)
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function WhereWhenPicker(props: WhereWhenPickerProps) {
  return (
    <>
      {/* MOBILE: single pill */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={props.openMobileSheet}
          className="w-full rounded-full bg-[var(--card)] border border-slate-200 px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-4 h-4 opacity-80" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                Start your Journey
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {props.whereSummary} · {props.whenLabel}
              </div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 opacity-70" />
        </button>
      </div>

      {/* DESKTOP: pills row */}
      <div className="relative hidden md:block">
        <div className="w-full rounded-full bg-[var(--card)] border border-slate-200 shadow-sm">
          <div className="flex">
            {/* WHERE pill */}
            <div ref={props.whereRef} className="relative flex-1">
              <button
                type="button"
                onClick={props.openWhereDesktop}
                className={[
                  "w-full rounded-l-full rounded-r-none px-4 py-3 text-left",
                  "hover:bg-slate-50 transition flex items-center justify-between gap-3",
                  props.activePill === "where" ? "bg-slate-50" : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                    Where
                  </div>
                  <div className="text-sm truncate">{props.whereSummary}</div>
                </div>
                <div className="flex items-center gap-2 opacity-80">
                  <MapPin className="w-4 h-4" />
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              {props.showWherePopover && (
                <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-white p-4 border border-slate-200 shadow-lg">
                  {props.whereStep === "start" ? (
                    <WherePickerPanel
                      step="start"
                      mobileSheetOpen={false}
                      startQuery={props.startQuery}
                      setStartQuery={props.setStartQuery}
                      endQuery={props.endQuery}
                      setEndQuery={props.setEndQuery}
                      startResults={props.startResults}
                      endResults={props.endResults}
                      recent={props.recent}
                      suggested={props.suggested}
                      startCityId={props.startCityId}
                      selectStartCity={props.selectStartCity}
                      selectEndCity={props.selectEndCity}
                      selectReturnToStart={props.selectReturnToStart}
                    />
                  ) : (
                    <WherePickerPanel
                      step="end"
                      mobileSheetOpen={false}
                      startQuery={props.startQuery}
                      setStartQuery={props.setStartQuery}
                      endQuery={props.endQuery}
                      setEndQuery={props.setEndQuery}
                      startResults={props.startResults}
                      endResults={props.endResults}
                      recent={props.recent}
                      suggested={props.suggested}
                      startCityId={props.startCityId}
                      selectStartCity={props.selectStartCity}
                      selectEndCity={props.selectEndCity}
                      selectReturnToStart={props.selectReturnToStart}
                    />
                  )}

                  <div className="mt-3 text-[11px] text-slate-500">
                    Cities are mapped with latitude &amp; longitude, so we can
                    factor in realistic driving legs later.
                  </div>
                </div>
              )}
            </div>

            <div className="w-px bg-slate-200" />

            {/* WHEN pill */}
            <div ref={props.whenRef} className="relative flex-1">
              <button
                type="button"
                onClick={props.openWhenDesktop}
                className={[
                  "w-full rounded-r-full rounded-l-none px-4 py-3 text-left",
                  "hover:bg-slate-50 transition flex items-center justify-between gap-3",
                  props.activePill === "when" ? "bg-slate-50" : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                    When
                  </div>
                  <div className="text-sm truncate">{props.whenLabel}</div>
                </div>
                <Calendar className="w-4 h-4 opacity-80" />
              </button>

              {props.showCalendar && (
                <div
                  className={[
                    "absolute left-0 mt-3 z-30 rounded-2xl bg-white border border-slate-200 shadow-lg",
                    "overflow-hidden w-[720px] p-3",
                  ].join(" ")}
                >
                  <div className="px-2 pb-2">
                    <p className="text-[11px] text-slate-600">
                      Pick a start date, then an end date.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <DayPicker
                      mode="range"
                      selected={props.dateRange}
                      onSelect={props.handleDateRangeChange}
                      numberOfMonths={2}
                      weekStartsOn={1}
                      month={props.calendarMonth}
                      onMonthChange={props.setCalendarMonth}
                      styles={{
                        months: {
                          display: "flex",
                          flexWrap: "nowrap",
                          gap: "24px",
                          justifyContent: "space-between",
                        },
                        month: { width: "320px" },
                      }}
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
        </div>

        {props.totalTripDays > 0 && (
          <p className="text-[11px] text-gray-400 mt-2">
            Total days in itinerary (inclusive):{" "}
            <strong>{props.totalTripDays}</strong>
          </p>
        )}
      </div>

      {/* MOBILE SHEET */}
      {props.mobileSheetOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/55"
            onClick={props.closeMobileSheet}
          />
          <div className="absolute left-0 right-0 bottom-0 rounded-t-3xl bg-white border-t border-slate-200 shadow-2xl">
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

              <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => props.setMobileActive("where")}
                  className={[
                    "w-full px-4 py-3 flex items-center justify-between",
                    props.mobileActive === "where" ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  <div className="text-left">
                    <div className="text-[11px] text-slate-600">Where</div>
                    <div className="text-sm text-slate-800">{props.whereSummary}</div>
                  </div>
                  <MapPin className="w-4 h-4 text-slate-500" />
                </button>

                <div className="h-px bg-slate-200" />

                <button
                  type="button"
                  onClick={() => props.setMobileActive("when")}
                  className={[
                    "w-full px-4 py-3 flex items-center justify-between",
                    props.mobileActive === "when" ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  <div className="text-left">
                    <div className="text-[11px] text-slate-600">When</div>
                    <div className="text-sm text-slate-800">{props.whenLabel}</div>
                  </div>
                  <Calendar className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="mt-4">
                {props.mobileActive === "where" ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    {props.whereStep === "start" ? (
                      <WherePickerPanel
                        step="start"
                        mobileSheetOpen
                        startQuery={props.startQuery}
                        setStartQuery={props.setStartQuery}
                        endQuery={props.endQuery}
                        setEndQuery={props.setEndQuery}
                        startResults={props.startResults}
                        endResults={props.endResults}
                        recent={props.recent}
                        suggested={props.suggested}
                        startCityId={props.startCityId}
                        selectStartCity={props.selectStartCity}
                        selectEndCity={props.selectEndCity}
                        selectReturnToStart={props.selectReturnToStart}
                      />
                    ) : (
                      <WherePickerPanel
                        step="end"
                        mobileSheetOpen
                        startQuery={props.startQuery}
                        setStartQuery={props.setStartQuery}
                        endQuery={props.endQuery}
                        setEndQuery={props.setEndQuery}
                        startResults={props.startResults}
                        endResults={props.endResults}
                        recent={props.recent}
                        suggested={props.suggested}
                        startCityId={props.startCityId}
                        selectStartCity={props.selectStartCity}
                        selectEndCity={props.selectEndCity}
                        selectReturnToStart={props.selectReturnToStart}
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
                    <div className="p-2">
                      <DayPicker
                        mode="range"
                        selected={props.dateRange}
                        onSelect={props.handleDateRangeChange}
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

              {props.mobileActive === "where" && props.whereStep === "start" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                    onClick={() => props.setWhereStep("end")}
                  >
                    Skip to end city
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
