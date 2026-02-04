"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ArrowLeft, Navigation, MapPin } from "lucide-react";
import { getCityById } from "@/lib/nzCities";
import { NZ_STOPS, type NzStop } from "@/lib/nzStops";
import { normalize, parseDisplayName, type CityLite } from "@/lib/trip-planner/utils";
import { usePlaceSearch } from "@/lib/trip-planner/useTripPlanner.hooks";

type PlacesThingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  step: "places" | "things";
  onStepChange: (step: "places" | "things") => void;
  placesQuery: string;
  thingsQuery: string;
  setPlacesQuery: (v: string) => void;
  setThingsQuery: (v: string) => void;
  placesResults: CityLite[];
  thingsResults: NzStop[];
  recent: CityLite[];
  suggested: CityLite[];
  selectedPlaceIds: string[];
  selectedPlaces?: Array<{ id: string; name: string }>;
  selectedThingIds: string[];
  onSelectPlace: (cityId: string) => void | Promise<void>;
  onSelectThing: (stopId: string) => void;
  onRemovePlace: (cityId: string) => void;
  onRemoveThing: (stopId: string) => void;
};

function CityIcon({ variant }: { variant: "recent" | "suggested" | "nearby" }) {
  const base =
    "w-9 h-9 rounded-xl flex items-center justify-center border border-black/5";
  if (variant === "recent") {
    return (
      <div className={`${base} bg-[#EAF7EA]`}>
        <Navigation className="w-4 h-4 text-emerald-700" />
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

function PlacesThingsListItem({
  title,
  subtitle,
  onClick,
  iconVariant,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  iconVariant: "recent" | "suggested" | "nearby";
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
    </button>
  );
}

function PlacesPickerPanel({
  query,
  setQuery,
  results,
  recent,
  suggested,
  selectedCityIds,
  selectedPlaces,
  onSelectCity,
  onRemoveCity,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  selectedCityIds: string[];
  selectedPlaces?: Array<{ id: string; name: string }>;
  onSelectCity: (cityId: string) => void | Promise<void>;
  onRemoveCity: (cityId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  const showBrowseLists = normalize(query).length === 0;
  const filteredRecent = recent.filter((c) => !selectedCityIds.includes(c.id));
  const filteredSuggested = suggested.filter((c) => !selectedCityIds.includes(c.id));
  const filteredResults = results.filter((c) => !selectedCityIds.includes(c.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-800">
            Places to go
          </div>
          <div className="text-[11px] text-slate-600">
            Type to search, or pick a suggestion.
          </div>
        </div>
      </div>

      {selectedCityIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCityIds.map((cityId) => {
            const city = selectedPlaces?.find((p) => p.id === cityId) || getCityById(cityId);
            if (!city) return null;
            return (
              <span
                key={cityId}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-sm text-slate-800"
              >
                {city.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCity(cityId);
                  }}
                  className="w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center transition"
                >
                  <X className="w-3 h-3 text-slate-600" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search places"
          className="w-full bg-transparent outline-none text-base md:text-sm placeholder:text-slate-400 text-slate-800 no-zoom-mobile"
        />
      </div>

      <div
        ref={suggestionsRef}
        className="pr-1"
      >
        {showBrowseLists ? (
          <>
            {filteredRecent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {filteredRecent.map((c) => {
                    const { cityName, district } = parseDisplayName(c.name);
                    return (
                      <PlacesThingsListItem
                        key={`places-recent-${c.id}`}
                        title={cityName || c.name.split(',')[0].trim()}
                        subtitle={district || undefined}
                        iconVariant="recent"
                        onClick={async () => {
                          try {
                            await onSelectCity(c.id);
                          } catch (error) {
                            console.error("Error selecting city:", error);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-2">
              <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
                Suggested places
              </div>
              <div className="space-y-1">
                {filteredSuggested.map((c) => (
                  <PlacesThingsListItem
                    key={`places-suggested-${c.id}`}
                    title={c.name}
                    subtitle="Top destination"
                    iconVariant="suggested"
                    onClick={async () => {
                      try {
                        await onSelectCity(c.id);
                      } catch (error) {
                        console.error("Error selecting city:", error);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
              Matches
            </div>
            {filteredResults.length === 0 ? (
              <div className="px-2 py-3 text-sm text-slate-600">
                No matches. Try a different spelling.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredResults.map((c) => (
                  <PlacesThingsListItem
                    key={`places-match-${c.id}`}
                    title={c.cityName || c.name.split(',')[0].trim()}
                    subtitle={c.district || undefined}
                    iconVariant="suggested"
                    onClick={async () => {
                      try {
                        await onSelectCity(c.id);
                      } catch (error) {
                        console.error("Error selecting city:", error);
                      }
                    }}
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

function ThingsPickerPanel({
  query,
  setQuery,
  results,
  selectedStopIds,
  onSelectStop,
  onRemoveStop,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: NzStop[];
  selectedStopIds: string[];
  onSelectStop: (stopId: string) => void;
  onRemoveStop: (stopId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  const showBrowseLists = normalize(query).length === 0;
  const browseStops = NZ_STOPS.slice(0, 20).filter((s) => !selectedStopIds.includes(s.id));
  const filteredResults = results.filter((s) => !selectedStopIds.includes(s.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-800">
            Things to do
          </div>
          <div className="text-[11px] text-slate-600">
            Type to search, or pick a suggestion.
          </div>
        </div>
      </div>

      {selectedStopIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedStopIds.map((stopId) => {
            const stop = NZ_STOPS.find((s) => s.id === stopId);
            if (!stop) return null;
            return (
              <span
                key={stopId}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-sm text-slate-800"
              >
                {stop.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStop(stopId);
                  }}
                  className="w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center transition"
                >
                  <X className="w-3 h-3 text-slate-600" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search things to do"
          className="w-full bg-transparent outline-none text-base md:text-sm placeholder:text-slate-400 text-slate-800 no-zoom-mobile"
        />
      </div>

      <div
        ref={suggestionsRef}
        className="pr-1"
      >
        {showBrowseLists ? (
          <div className="mb-2">
            <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
              Popular destinations
            </div>
            <div className="space-y-1">
              {browseStops.map((stop) => (
                <PlacesThingsListItem
                  key={`things-suggested-${stop.id}`}
                  title={stop.name}
                  subtitle="New Zealand"
                  iconVariant="suggested"
                  onClick={() => onSelectStop(stop.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
              Matches
            </div>
            {filteredResults.length === 0 ? (
              <div className="px-2 py-3 text-sm text-slate-600">
                No matches. Try a different spelling.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredResults.map((stop) => (
                  <PlacesThingsListItem
                    key={`things-match-${stop.id}`}
                    title={stop.name}
                    subtitle="New Zealand"
                    iconVariant="suggested"
                    onClick={() => onSelectStop(stop.id)}
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

export default function PlacesThingsModal({
  isOpen,
  onClose,
  step,
  onStepChange,
  placesQuery,
  thingsQuery,
  setPlacesQuery,
  setThingsQuery,
  placesResults,
  thingsResults,
  recent,
  suggested,
  selectedPlaceIds,
  selectedPlaces,
  selectedThingIds,
  onSelectPlace,
  onSelectThing,
  onRemovePlace,
  onRemoveThing,
}: PlacesThingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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

  // Blur input on modal scroll/touchmove (for mobile keyboard dismissal)
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl || !isOpen) return;

    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        // Find and blur the active input in the modal
        const activeInput = modalEl.querySelector('input:focus') as HTMLInputElement;
        if (activeInput) {
          activeInput.blur();
        }
      }
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };

    const handleTouchMove = () => {
      // Find and blur the active input in the modal
      const activeInput = modalEl.querySelector('input:focus') as HTMLInputElement;
      if (activeInput) {
        activeInput.blur();
      }
    };

    modalEl.addEventListener("scroll", handleScroll);
    modalEl.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      modalEl.removeEventListener("scroll", handleScroll);
      modalEl.removeEventListener("touchmove", handleTouchMove);
      clearTimeout(scrollTimeout);
    };
  }, [isOpen]);

  const handleBack = () => {
    if (step === "things") {
      onStepChange("places");
    }
  };

  if (!mounted || !isOpen) return null;

  const showBackButton = step === "things";

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className={`relative z-10 w-full rounded-2xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col p-6 max-w-2xl`}
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
              {step === "places" 
                ? "Select Places to Go" 
                : "Select Things to Do"}
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
          {step === "places" ? (
            <PlacesPickerPanel
              query={placesQuery}
              setQuery={setPlacesQuery}
              results={placesResults}
              recent={recent}
              suggested={suggested}
              selectedCityIds={selectedPlaceIds}
              selectedPlaces={selectedPlaces}
              onSelectCity={onSelectPlace}
              onRemoveCity={onRemovePlace}
            />
          ) : (
            <ThingsPickerPanel
              query={thingsQuery}
              setQuery={setThingsQuery}
              results={thingsResults}
              selectedStopIds={selectedThingIds}
              onSelectStop={onSelectThing}
              onRemoveStop={onRemoveThing}
            />
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:brightness-110 transition shadow-lg hover:shadow-xl"
            style={{ 
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
