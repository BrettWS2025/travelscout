"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, MapPin } from "lucide-react";
import { getCityById, searchPlacesByName, getPlaceById, type Place } from "@/lib/nzCities";
import { normalize, pickSuggestedCities, type CityLite } from "@/lib/trip-planner/utils";

type CitySearchPillProps = {
  value: string | null;
  onSelect: (cityId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CitySearchPill({
  value,
  onSelect,
  onCancel,
  onConfirm,
}: CitySearchPillProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [dbSearchResults, setDbSearchResults] = useState<Place[]>([]);
  const [selectedPlaceData, setSelectedPlaceData] = useState<Place | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Try to get selected city from stored data, cache, or fetch from database
  const selectedCity = useMemo(() => {
    if (!value) return null;
    
    // First try stored data
    if (selectedPlaceData && selectedPlaceData.id === value) {
      return selectedPlaceData;
    }
    
    // Then try cache
    const cached = getCityById(value);
    if (cached) return cached;
    
    return null;
  }, [value, selectedPlaceData]);

  const suggested = pickSuggestedCities();

  // Search places from database when user types (same as PlacesPickerPanel)
  useEffect(() => {
    if (!query.trim()) {
      setDbSearchResults([]);
      return;
    }

    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(query, 20);
        setDbSearchResults(results.slice(0, 8));
      } catch (error) {
        console.error("Error searching places:", error);
        setDbSearchResults([]);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Fetch place data when value changes (if not already stored)
  useEffect(() => {
    if (!value) {
      setSelectedPlaceData(null);
      return;
    }

    // If we already have the data, don't fetch again
    if (selectedPlaceData && selectedPlaceData.id === value) {
      return;
    }

    // Try cache first
    const cached = getCityById(value);
    if (cached) {
      setSelectedPlaceData(cached);
      return;
    }

    // Fetch from database
    const fetchPlace = async () => {
      try {
        const place = await getPlaceById(value);
        if (place) {
          setSelectedPlaceData(place);
        }
      } catch (error) {
        console.error("Error fetching place:", error);
      }
    };

    fetchPlace();
  }, [value, selectedPlaceData]);

  const searchResults = useMemo(() => {
    return dbSearchResults.map((p) => ({ id: p.id, name: p.name }));
  }, [dbSearchResults]);

  const showSuggestions = normalize(query).length === 0;
  const filteredSuggested = suggested.filter((c) => c.id !== value);
  const filteredResults = searchResults.filter((c) => c.id !== value);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleSelectCity(cityId: string) {
    // Try to get place data from search results first (we have full data there)
    const foundInResults = dbSearchResults.find((r) => r.id === cityId);
    if (foundInResults) {
      setSelectedPlaceData(foundInResults);
    } else {
      // If not in search results (e.g., from suggested), try cache or fetch
      let place = getCityById(cityId);
      if (!place) {
        try {
          place = await getPlaceById(cityId);
        } catch (error) {
          console.error("Error fetching place:", error);
        }
      }
      if (place) {
        setSelectedPlaceData(place);
      }
    }
    
    onSelect(cityId);
    setIsOpen(false);
    setQuery("");
  }

  // Calculate dropdown position
  const [dropdownStyle, setDropdownStyle] = useState<{ top?: string; left?: string; width?: string }>({});
  
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    function updatePosition() {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: `${containerRect.bottom + 8}px`,
        left: `${containerRect.left}px`,
        width: `${containerRect.width}px`,
      });
    }

    // Update position initially
    updatePosition();

    // Update position on scroll and resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            {!isOpen ? (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={[
                  "w-full rounded-full bg-slate-100 border border-slate-200",
                  "px-3 py-2 md:px-4 md:py-2",
                  "hover:bg-slate-50 transition flex items-center gap-2 text-left",
                ].join(" ")}
              >
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <span className={selectedCity ? "text-sm text-slate-800 font-semibold truncate" : "text-sm text-slate-500 truncate"}>
                  {selectedCity ? selectedCity.name : "Search places"}
                </span>
              </button>
            ) : (
              <div className="rounded-full bg-slate-100 border border-slate-200 px-3 py-2 md:px-4 md:py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search places"
                  className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400 text-slate-800"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                      setQuery("");
                    }
                  }}
                />
              </div>
            )}
          </div>

          {!isOpen && (
            <>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!value}
                className="rounded-full px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add stop
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-[11px] md:text-xs text-slate-600 hover:text-slate-800 hover:underline underline-offset-2"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] rounded-2xl bg-white p-3 border border-slate-200 shadow-lg max-h-64 overflow-auto"
          style={dropdownStyle}
        >
          {showSuggestions ? (
            <>
              {filteredSuggested.length > 0 && (
                <div className="mb-2">
                  <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
                    Suggested places
                  </div>
                  <div className="space-y-1">
                    {filteredSuggested.map((c) => (
                      <button
                        key={`suggested-${c.id}`}
                        type="button"
                        onClick={() => handleSelectCity(c.id)}
                        className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#F6F1EA] flex items-center justify-center border border-black/5">
                          <MapPin className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                          <div className="text-[12px] text-slate-600 truncate">Top destination</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                    <button
                      key={`result-${c.id}`}
                      type="button"
                      onClick={() => handleSelectCity(c.id)}
                      className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#F6F1EA] flex items-center justify-center border border-black/5">
                        <MapPin className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                        <div className="text-[12px] text-slate-600 truncate">New Zealand</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
