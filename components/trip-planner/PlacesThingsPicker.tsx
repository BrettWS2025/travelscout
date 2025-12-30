"use client";

import type React from "react";
import {
  MapPin,
  ChevronDown,
  Search,
  Navigation,
  X,
} from "lucide-react";
import { NZ_CITIES, getCityById } from "@/lib/nzCities";
import { NZ_STOPS, type NzStop } from "@/lib/nzStops";
import { normalize, type CityLite } from "@/lib/trip-planner/utils";

type ActivePlacesThingsPill = "places" | "things" | null;

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
      className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition"
    >
      <CityIcon variant={iconVariant} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{title}</div>
        {subtitle ? (
          <div className="text-[12px] text-gray-300 truncate">{subtitle}</div>
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
  onSelectCity,
  onRemoveCity,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: CityLite[];
  recent: CityLite[];
  suggested: CityLite[];
  selectedCityIds: string[];
  onSelectCity: (cityId: string) => void;
  onRemoveCity: (cityId: string) => void;
}) {
  const showBrowseLists = normalize(query).length === 0;
  const filteredRecent = recent.filter((c) => !selectedCityIds.includes(c.id));
  const filteredSuggested = suggested.filter((c) => !selectedCityIds.includes(c.id));
  const filteredResults = results.filter((c) => !selectedCityIds.includes(c.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-white">
            Places to go
          </div>
          <div className="text-[11px] text-gray-300">
            Type to search, or pick a suggestion.
          </div>
        </div>
      </div>

      {selectedCityIds.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-2 space-y-1">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2">
            Selected places
          </div>
          {selectedCityIds.map((cityId) => {
            const city = getCityById(cityId);
            if (!city) return null;
            return (
              <div
                key={cityId}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                <span className="text-sm text-white">{city.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveCity(cityId)}
                  className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-gray-300" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search places"
          className="w-full bg-transparent outline-none text-sm placeholder:text-gray-400"
        />
      </div>

      <div className="max-h-[52vh] overflow-auto pr-1">
        {showBrowseLists ? (
          <>
            {filteredRecent.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Recent searches
                </div>
                <div className="space-y-1">
                  {filteredRecent.map((c) => (
                    <PlacesThingsListItem
                      key={`places-recent-${c.id}`}
                      title={c.name}
                      subtitle="Recently used place"
                      iconVariant="recent"
                      onClick={() => onSelectCity(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mb-2">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                Suggested places
              </div>
              <div className="space-y-1">
                {filteredSuggested.map((c) => (
                  <PlacesThingsListItem
                    key={`places-suggested-${c.id}`}
                    title={c.name}
                    subtitle="Top destination"
                    iconVariant="suggested"
                    onClick={() => onSelectCity(c.id)}
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
            {filteredResults.length === 0 ? (
              <div className="px-2 py-3 text-sm text-gray-300">
                No matches. Try a different spelling.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredResults.map((c) => (
                  <PlacesThingsListItem
                    key={`places-match-${c.id}`}
                    title={c.name}
                    subtitle="New Zealand"
                    iconVariant="suggested"
                    onClick={() => onSelectCity(c.id)}
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
  const showBrowseLists = normalize(query).length === 0;
  const browseStops = NZ_STOPS.slice(0, 20).filter((s) => !selectedStopIds.includes(s.id));
  const filteredResults = results.filter((s) => !selectedStopIds.includes(s.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-white">
            Things to do
          </div>
          <div className="text-[11px] text-gray-300">
            Type to search, or pick a suggestion.
          </div>
        </div>
      </div>

      {selectedStopIds.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-2 space-y-1">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2">
            Selected things
          </div>
          {selectedStopIds.map((stopId) => {
            const stop = NZ_STOPS.find((s) => s.id === stopId);
            if (!stop) return null;
            return (
              <div
                key={stopId}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                <span className="text-sm text-white">{stop.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveStop(stopId)}
                  className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-gray-300" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search things to do"
          className="w-full bg-transparent outline-none text-sm placeholder:text-gray-400"
        />
      </div>

      <div className="max-h-[52vh] overflow-auto pr-1">
        {showBrowseLists ? (
          <div className="mb-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
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
            <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
              Matches
            </div>
            {filteredResults.length === 0 ? (
              <div className="px-2 py-3 text-sm text-gray-300">
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

export type PlacesThingsPickerProps = {
  placesRef: React.RefObject<HTMLDivElement>;
  thingsRef: React.RefObject<HTMLDivElement>;

  activePill: ActivePlacesThingsPill;
  showPlacesPopover: boolean;
  showThingsPopover: boolean;

  placesQuery: string;
  thingsQuery: string;

  placesResults: CityLite[];
  thingsResults: NzStop[];

  recent: CityLite[];
  suggested: CityLite[];

  selectedPlaceIds: string[];
  selectedThingIds: string[];

  placesSummary: string;
  thingsSummary: string;

  setPlacesQuery: (v: string) => void;
  setThingsQuery: (v: string) => void;
  setActivePill: (v: ActivePlacesThingsPill) => void;
  setShowPlacesPopover: (v: boolean) => void;
  setShowThingsPopover: (v: boolean) => void;
  openPlacesDesktop: () => void;
  openThingsDesktop: () => void;
  selectPlace: (cityId: string) => void;
  selectThing: (stopId: string) => void;
  removePlace: (cityId: string) => void;
  removeThing: (stopId: string) => void;
};

export default function PlacesThingsPicker(props: PlacesThingsPickerProps) {
  return (
    <div className="relative hidden md:block">
      <div className="w-full rounded-full bg-[var(--card)] border border-white/15 shadow-sm">
        <div className="flex">
          {/* PLACES pill */}
          <div ref={props.placesRef} className="relative flex-1">
            <button
              type="button"
              onClick={props.openPlacesDesktop}
              className={[
                "w-full rounded-l-full rounded-r-none px-4 py-3 text-left",
                "hover:bg-white/5 transition flex items-center justify-between gap-3",
                props.activePill === "places" ? "bg-white/5" : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  Places to go
                </div>
                <div className="text-sm truncate">{props.placesSummary}</div>
              </div>
              <div className="flex items-center gap-2 opacity-80">
                <MapPin className="w-4 h-4" />
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            {props.showPlacesPopover && (
              <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-[#1E2C4B] p-4 border border-white/10 shadow-lg">
                <PlacesPickerPanel
                  query={props.placesQuery}
                  setQuery={props.setPlacesQuery}
                  results={props.placesResults}
                  recent={props.recent}
                  suggested={props.suggested}
                  selectedCityIds={props.selectedPlaceIds}
                  onSelectCity={props.selectPlace}
                  onRemoveCity={props.removePlace}
                />
              </div>
            )}
          </div>

          <div className="w-px bg-white/10" />

          {/* THINGS pill */}
          <div ref={props.thingsRef} className="relative flex-1">
            <button
              type="button"
              onClick={props.openThingsDesktop}
              className={[
                "w-full rounded-r-full rounded-l-none px-4 py-3 text-left",
                "hover:bg-white/5 transition flex items-center justify-between gap-3",
                props.activePill === "things" ? "bg-white/5" : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  Things to do
                </div>
                <div className="text-sm truncate">{props.thingsSummary}</div>
              </div>
              <div className="flex items-center gap-2 opacity-80">
                <Navigation className="w-4 h-4" />
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            {props.showThingsPopover && (
              <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-[#1E2C4B] p-4 border border-white/10 shadow-lg">
                <ThingsPickerPanel
                  query={props.thingsQuery}
                  setQuery={props.setThingsQuery}
                  results={props.thingsResults}
                  selectedStopIds={props.selectedThingIds}
                  onSelectStop={props.selectThing}
                  onRemoveStop={props.removeThing}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

