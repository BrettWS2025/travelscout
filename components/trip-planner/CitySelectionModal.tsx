"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { X, Search, ArrowLeft, ArrowLeftRight, Clock, Navigation, MapPin, Calendar } from "lucide-react";
import { getCityById } from "@/lib/nzCities";
import { normalize, parseDisplayName, type CityLite } from "@/lib/trip-planner/utils";
import { usePlaceSearch } from "@/lib/trip-planner/useTripPlanner.hooks";

type CitySelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  step: "start" | "end" | "destinations" | "dates" | "return";
  onStepChange: (step: "start" | "end" | "destinations" | "dates" | "return") => void;
  startCityId: string;
  endCityId: string;
  onSelectStartCity: (cityId: string) => void;
  onSelectEndCity: (cityId: string) => void;
  onSelectReturnToStart: () => void;
  onClearEndCity?: () => void;
  onSelectDates: () => void;
  dateRange: DateRange | undefined;
  calendarMonth: Date;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onCalendarMonthChange: (month: Date) => void;
  onClearDates: () => void;
  recent: CityLite[];
  suggested: CityLite[];
};

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

function CityListItem({
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

function CityPickerPanel({
  step,
  query,
  setQuery,
  results,
  recent,
  suggested,
  startCityId,
  onSelectStartCity,
  onSelectEndCity,
  onSelectReturnToStart,
  onClose,
}: {
  step: "start" | "end" | "destinations" | "return";
  query: string;
  setQuery: (v: string) => void;
  results: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  startCityId: string;
  onSelectStartCity: (id: string) => void;
  onSelectEndCity: (id: string) => void;
  onSelectReturnToStart: () => void;
  onClose: () => void;
}) {
  const isStart = step === "start";
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  // Show browse lists (recent/suggested) when query is empty OR when there are no results yet
  const showBrowseLists = normalize(query).length === 0 || results.length === 0;
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
          <div className="text-base font-semibold text-slate-800">
            {isStart ? "Start Journey" : "Where are you finishing?"}
          </div>
          <div className="text-[11px] text-slate-600">
            Type to search, or pick a suggestion.
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search destinations"
          className="w-full bg-transparent outline-none text-base md:text-sm placeholder:text-slate-400 text-slate-800 no-zoom-mobile"
        />
      </div>

      <div
        ref={suggestionsRef}
        className="pr-1"
      >
        {!isStart && startCity && (
          <div className="mb-3">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide px-2 mb-1">
              Quick option
            </div>
            <CityListItem
              title="Return to start city"
              subtitle={`Finish in ${startCity.name}`}
              iconVariant="suggested"
              right={<ArrowLeftRight className="w-4 h-4 opacity-80" />}
              onClick={onSelectReturnToStart}
            />
          </div>
        )}

        {showBrowseLists ? (
          <>
            {recent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {recent.map((c) => {
                    const { cityName, district } = parseDisplayName(c.name);
                    return (
                      <CityListItem
                        key={`${step}-recent-${c.id}`}
                        title={cityName || c.name.split(',')[0].trim()}
                        subtitle={district || undefined}
                        iconVariant="recent"
                        onClick={() =>
                          isStart ? onSelectStartCity(c.id) : onSelectEndCity(c.id)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-2">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide px-2 mb-1">
                Suggested destinations
              </div>
              <div className="space-y-1">
                {suggested.map((c) => (
                  <CityListItem
                    key={`${step}-suggested-${c.id}`}
                    title={c.name}
                    subtitle={isStart ? "Top departure" : "Top destination"}
                    iconVariant="suggested"
                    onClick={() =>
                      isStart ? onSelectStartCity(c.id) : onSelectEndCity(c.id)
                    }
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {results.length > 0 && (
              <>
                <div className="text-[11px] text-slate-500 uppercase tracking-wide px-2 mb-1">
                  Matches
                </div>
                <div className="space-y-1">
                  {results.map((c) => (
                    <CityListItem
                      key={`${step}-match-${c.id}`}
                      title={c.cityName || c.name.split(',')[0].trim()}
                      subtitle={c.district || undefined}
                      iconVariant="suggested"
                      onClick={() =>
                        isStart ? onSelectStartCity(c.id) : onSelectEndCity(c.id)
                      }
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

export default function CitySelectionModal({
  isOpen,
  onClose,
  step,
  onStepChange,
  startCityId,
  endCityId,
  onSelectStartCity,
  onSelectEndCity,
  onSelectReturnToStart,
  onClearEndCity,
  onSelectDates,
  dateRange,
  calendarMonth,
  onDateRangeChange,
  onCalendarMonthChange,
  onClearDates,
  recent,
  suggested,
}: CitySelectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showReturnQuestion, setShowReturnQuestion] = useState(false);
  const [pendingStartCityId, setPendingStartCityId] = useState<string | null>(null);
  const startResults = usePlaceSearch(startQuery);
  const endResults = usePlaceSearch(endQuery);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset queries when modal opens
  useEffect(() => {
    if (isOpen) {
      const startCity = getCityById(startCityId);
      const endCity = getCityById(endCityId);
      setStartQuery(startCity?.name ?? "");
      setEndQuery(endCity?.name ?? "");
      
      // If step is "return", show the return question immediately
      if (step === "return") {
        setPendingStartCityId(startCityId);
        setShowReturnQuestion(true);
      } else {
        setShowReturnQuestion(false);
        setPendingStartCityId(null);
      }
    }
  }, [isOpen, startCityId, endCityId, step]);

  const handleSelectStartCity = async (cityId: string) => {
    await onSelectStartCity(cityId);
    // Show return question instead of automatically setting end city
    setPendingStartCityId(cityId);
    setShowReturnQuestion(true);
  };

  const handleReturnYes = async () => {
    // Use pendingStartCityId if set, otherwise use current startCityId (when opened from refresh icon)
    const cityIdToUse = pendingStartCityId || startCityId;
    if (cityIdToUse) {
      await onSelectEndCity(cityIdToUse);
    }
    setShowReturnQuestion(false);
    setPendingStartCityId(null);
    onClose();
  };

  const handleReturnNo = () => {
    // Clear end city when user selects No
    if (onClearEndCity) {
      onClearEndCity();
    }
    setShowReturnQuestion(false);
    setPendingStartCityId(null);
    onClose();
  };

  const handleSelectEndCity = async (cityId: string) => {
    await onSelectEndCity(cityId);
    // Automatically move to date selection
    onStepChange("dates");
  };

  const handleSelectReturnToStart = async () => {
    await onSelectReturnToStart();
    // Automatically move to date selection
    onStepChange("dates");
  };

  const handleBack = () => {
    if (step === "end") {
      onStepChange("start");
    } else if (step === "dates") {
      onStepChange("end");
    }
  };

  const handleSelectDatesClick = () => {
    onStepChange("dates");
  };

  const handleDoneDates = () => {
    onClose();
  };

  if (!mounted || !isOpen) return null;

  const currentQuery = step === "start" ? startQuery : endQuery;
  const setCurrentQuery = step === "start" ? setStartQuery : setEndQuery;
  const currentResults = step === "start" ? startResults : endResults;
  const endCitySelected = !!endCityId;
  const showBackButton = step === "end" || step === "dates";
  const showSelectDatesButton = step === "start" || step === "end";

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full rounded-2xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col ${
          step === "dates" 
            ? isMobile 
              ? "p-3 max-w-full" 
              : "p-6 max-w-3xl"
            : "p-6 max-w-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <button
                type="button"
                onClick={handleBack}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition"
              >
                <ArrowLeft className="w-4 h-4 text-slate-700" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-slate-800">
              {step === "start" 
                ? "Start Journey" 
                : step === "end" 
                ? "Select End City" 
                : step === "return"
                ? "Return to Start"
                : "Select Dates"}
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4 text-slate-700" />
          </button>
        </div>

        <div className="flex-1 pr-2">
          {showReturnQuestion ? (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Will you be returning to this location?
                </h3>
                <p className="text-sm text-slate-600 mb-6">
                  {pendingStartCityId ? getCityById(pendingStartCityId)?.name : getCityById(startCityId)?.name}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={handleReturnYes}
                    className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={handleReturnNo}
                    className="px-6 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition"
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          ) : step === "dates" ? (
            <div className="space-y-3 flex flex-col items-center">
              <div className={isMobile ? "p-2 w-full" : "p-4 w-fit"}>
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={onDateRangeChange}
                  numberOfMonths={isMobile ? 1 : 2}
                  weekStartsOn={1}
                  month={calendarMonth}
                  onMonthChange={onCalendarMonthChange}
                  styles={{
                    months: {
                      display: "flex",
                      flexWrap: "nowrap",
                      gap: isMobile ? "0" : "24px",
                      justifyContent: "center",
                    },
                    month: { width: isMobile ? "100%" : "320px" },
                  }}
                />
              </div>
            </div>
          ) : (step === "start" || step === "end" || step === "return") ? (
            <CityPickerPanel
              step={step === "return" ? "start" : step}
              query={currentQuery}
              setQuery={setCurrentQuery}
              results={currentResults}
              recent={recent}
              suggested={suggested}
              startCityId={startCityId}
              onSelectStartCity={handleSelectStartCity}
              onSelectEndCity={handleSelectEndCity}
              onSelectReturnToStart={handleSelectReturnToStart}
              onClose={onClose}
            />
          ) : null}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition"
          >
            Cancel
          </button>
          {step === "dates" ? (
            <button
              type="button"
              onClick={handleDoneDates}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:brightness-110 transition shadow-lg hover:shadow-xl"
              style={{ 
                background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              }}
            >
              Done
            </button>
          ) : step === "end" ? (
            <button
              type="button"
              onClick={onClose}
              disabled={!endCitySelected}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              style={{ 
                background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              }}
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
