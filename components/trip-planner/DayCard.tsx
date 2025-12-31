"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import { formatDisplayDate, type DayDetail } from "@/lib/trip-planner/utils";
import EventsAttractionsCarousel from "@/components/trip-planner/EventsAttractionsCarousel";

type TripDay = TripPlan["days"][number];

type Props = {
  day: TripDay;
  stopName: string;
  isFirstForStop: boolean;
  isOpen: boolean;
  detail?: DayDetail;

  onToggleOpen: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateAccommodation: (accommodation: string) => void;

  /** Optional: render extra content inside the expanded panel (e.g. attraction / ticket options). */
  children?: ReactNode;
};

export default function DayCard({
  day,
  stopName,
  isFirstForStop,
  isOpen,
  detail,
  onToggleOpen,
  onUpdateNotes,
  onUpdateAccommodation,
  children,
}: Props) {
  return (
    <div className="rounded-2xl bg-[#1E2C4B]/40 border border-white/10 overflow-hidden">
      <div className="px-3 py-3">
        {/* Mobile: Stacked layout */}
        <div className="md:hidden space-y-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-semibold text-white">
                Day {day.dayNumber}
              </div>
              <span className="text-[11px] text-gray-300">
                {formatDisplayDate(day.date)}
              </span>

              {isFirstForStop && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border border-white/15 text-gray-200 bg-white/5">
                  First day here
                </span>
              )}
            </div>

            <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
              <ChevronRight className="w-3 h-3 opacity-70" />
              <span>Days in {stopName}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleOpen}
            className="w-full py-2.5 rounded-xl border border-white/20 text-sm font-medium hover:bg-white/10 active:bg-white/15 transition"
          >
            {isOpen ? "Hide details" : "Day details"}
          </button>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-white">
                Day {day.dayNumber}
              </div>
              <span className="text-[11px] text-gray-300">
                {formatDisplayDate(day.date)}
              </span>

              {isFirstForStop && (
                <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border border-white/15 text-gray-200 bg-white/5">
                  First day here
                </span>
              )}
            </div>

            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              <ChevronRight className="w-3 h-3 opacity-70" />
              <span>Days in {stopName}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleOpen}
            className="px-2.5 py-1.5 rounded-full border border-white/20 text-xs hover:bg-white/10"
          >
            {isOpen ? "Hide details" : "Day details"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-3 pb-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  What I&apos;m doing on this day
                </label>
                <textarea
                  rows={3}
                  className="input-dark w-full text-xs"
                  placeholder="e.g. Morning in the city, afternoon gondola, dinner at ..."
                  value={detail?.notes ?? ""}
                  onChange={(e) => onUpdateNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Where I&apos;m staying
                </label>
                <input
                  type="text"
                  className="input-dark w-full text-xs"
                  placeholder="e.g. Holiday park, hotel name, friend’s place"
                  value={detail?.accommodation ?? ""}
                  onChange={(e) => onUpdateAccommodation(e.target.value)}
                />
              </div>
            </div>

            {/* Events and Attractions */}
            <div className="pt-3 border-t border-white/10">
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-white">
                  Events & Attractions
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Available for this day
                </p>
              </div>
              <EventsAttractionsCarousel />
            </div>

            {children ? (
              <div className="pt-3 border-t border-white/10">{children}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
