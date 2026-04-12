"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { ManualEntrySection, ManualTripEntry } from "@/lib/trip-planner/utils";
import { createManualEntryId } from "@/lib/trip-planner/manualEntry";
import { resolvePlaceFromText } from "@/lib/trip-planner/resolveManualPlace";
import NearbyPlacesCarousel from "@/components/trip-planner/NearbyPlacesCarousel";

function isProbablyUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function addLabel(section: ManualEntrySection): string {
  switch (section) {
    case "thingsToDo":
      return "Add your own activity";
    case "events":
      return "Add your own event";
    case "hotel":
      return "Add your stay";
    case "restaurant":
      return "Add your booking";
    default:
      return "Add your own";
  }
}

type Props = {
  section: ManualEntrySection;
  entries: ManualTripEntry[];
  locationBias?: { lat: number; lng: number };
  onAdd: (entry: ManualTripEntry) => void;
  onRemove: (id: string) => void;
};

export default function ManualEntryInline({
  section,
  entries,
  locationBias,
  onAdd,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [locationText, setLocationText] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setLocationText("");
    setConfirmation("");
  };

  const handleSave = async () => {
    const n = name.trim();
    const loc = locationText.trim();
    const conf = confirmation.trim();
    if (!n && !loc && !conf) return;

    setSaving(true);
    const id = createManualEntryId();
    const base: ManualTripEntry = {
      id,
      section,
      name: n || undefined,
      locationText: loc || undefined,
      confirmation: conf || undefined,
    };

    const queryParts = [n, loc].filter(Boolean);
    const resolveHotel =
      section === "hotel" && queryParts.length > 0;

    if (resolveHotel) {
      const hotelOpts =
        locationBias
          ? { strictLocal: true, preferLodging: true, radiusMeters: 60000 as const }
          : undefined;
      const { place, error } = await resolvePlaceFromText(
        queryParts.join(", "),
        locationBias,
        hotelOpts
      );
      if (place) {
        onAdd({
          ...base,
          place,
          lat: place.lat,
          lng: place.lng,
        });
      } else {
        onAdd({
          ...base,
          resolveError: error,
        });
      }
    } else {
      onAdd(base);
    }

    setSaving(false);
    resetForm();
    setOpen(false);
  };

  if (section === "hotel" && entries[0]) {
    return (
      <div className="space-y-2">
        <ManualHotelResolvedCard entry={entries[0]} onRemove={() => onRemove(entries[0].id)} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="group relative inline-flex max-w-full items-start gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 pr-7 shadow-sm"
            >
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                className="absolute top-1 right-1 rounded-full p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="min-w-0 text-left">
                <div className="text-[11px] font-semibold text-slate-900 line-clamp-2">
                  {e.place?.name || e.name || e.locationText || "Your booking"}
                </div>
                {(e.place?.address || e.locationText) && (
                  <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                    {e.place?.address || e.locationText}
                  </div>
                )}
                {e.confirmation && (
                  <div className="text-[10px] text-indigo-600 mt-0.5 truncate max-w-[200px]">
                    {isProbablyUrl(e.confirmation) ? (
                      <a
                        href={e.confirmation}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-indigo-800"
                      >
                        Confirmation link
                      </a>
                    ) : (
                      <span>Ref: {e.confirmation}</span>
                    )}
                  </div>
                )}
                {e.resolveError && !e.place && (
                  <p className="text-[10px] text-amber-700 mt-0.5">{e.resolveError}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300/90 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80 hover:text-indigo-800"
        >
          <Plus className="h-3.5 w-3.5 shrink-0 opacity-70" />
          {addLabel(section)}
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm space-y-2">
          <div className="grid gap-2 sm:grid-cols-1">
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              placeholder={
                section === "hotel"
                  ? "Location or address (optional — helps find the place)"
                  : "Location or address (optional)"
              }
              value={locationText}
              onChange={(ev) => setLocationText(ev.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              placeholder="Confirmation # or link (optional)"
              value={confirmation}
              onChange={(ev) => setConfirmation(ev.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="rounded-full px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || (!name.trim() && !locationText.trim() && !confirmation.trim())}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rich hotel card when Google resolved a place; falls back to carousel-style layout. */
export function ManualHotelResolvedCard({
  entry,
  onRemove,
}: {
  entry: ManualTripEntry;
  onRemove: () => void;
}) {
  if (entry.place) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 rounded-full bg-slate-800/75 p-1 text-white hover:bg-slate-800"
          aria-label="Remove saved stay"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <NearbyPlacesCarousel
          places={[entry.place]}
          title="Your stay"
          size="compact"
          showUserRatingCount
          showDirectionsLink
          confirmationUrl={
            entry.confirmation && isProbablyUrl(entry.confirmation) ? entry.confirmation : undefined
          }
          confirmationRef={
            entry.confirmation && !isProbablyUrl(entry.confirmation) ? entry.confirmation : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 rounded-full bg-slate-800/75 p-1 text-white hover:bg-slate-800"
        aria-label="Remove saved stay"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="text-sm font-semibold text-slate-900 pr-8">{entry.name || "Your stay"}</div>
      {entry.locationText && <p className="text-xs text-slate-600 mt-1">{entry.locationText}</p>}
      {entry.confirmation && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {isProbablyUrl(entry.confirmation) ? (
            <a
              href={entry.confirmation}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Confirmation
            </a>
          ) : (
            <span className="text-xs font-medium text-slate-600">Ref: {entry.confirmation}</span>
          )}
        </div>
      )}
      {entry.resolveError && (
        <p className="text-[11px] text-amber-800 mt-2">Could not load place details: {entry.resolveError}</p>
      )}
    </div>
  );
}
