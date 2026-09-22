"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, MapPin } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import type { Event } from "@/lib/hooks/useEvents";
import type { DayDetail, DayStopMeta } from "@/lib/trip-planner/utils";
import {
  formatShortRangeDate,
  formatDisplayDate,
  makeDayKey,
} from "@/lib/trip-planner/utils";

type PinEventModalProps = {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  plan: TripPlan;
  dayDetails: Record<string, DayDetail>;
  onPinToDay: (date: string, location: string, event: Event) => void;
};

export default function PinEventModal({
  isOpen,
  onClose,
  event,
  plan,
  dayDetails,
  onPinToDay,
}: PinEventModalProps) {
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Expand first section by default
      if (plan.days.length > 0) {
        setExpandedSections(new Set(["days"]));
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, plan.days.length]);

  if (!mounted || !isOpen) return null;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handlePinToDay = (date: string, location: string) => {
    onPinToDay(date, location, event);
    onClose();
  };

  // Group days by location
  const daysByLocation = plan.days.reduce((acc, day) => {
    if (!acc[day.location]) {
      acc[day.location] = [];
    }
    acc[day.location].push(day);
    return acc;
  }, {} as Record<string, typeof plan.days>);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100">
              <MapPin className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pin Event to Day</h2>
              <p className="text-sm text-slate-600 mt-0.5">{event.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {plan.days.length === 0 ? (
            <div className="text-center py-8 text-slate-600">
              <p>No days in your itinerary yet.</p>
              <p className="text-sm mt-2">Create a trip plan first to pin events.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Days section */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("days")}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Trip Days</span>
                    <span className="text-xs text-slate-600 bg-white px-2 py-0.5 rounded-full">
                      {plan.days.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={[
                      "w-4 h-4 text-slate-600 transition-transform",
                      expandedSections.has("days") ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>
                {expandedSections.has("days") && (
                  <div className="p-3 space-y-2 bg-white">
                    {Object.entries(daysByLocation).map(([location, days]) => (
                      <div key={location} className="space-y-2">
                        {days.length > 1 && (
                          <div className="text-xs font-medium text-slate-700 px-2 py-1">
                            {location}
                          </div>
                        )}
                        {days.map((day) => {
                          const key = makeDayKey(day.date, day.location);
                          const detail = dayDetails[key];
                          const isPinned = detail?.events?.some((e) => e.id === event.id);

                          return (
                            <button
                              key={`day-${day.dayNumber}-${key}`}
                              type="button"
                              onClick={() => handlePinToDay(day.date, day.location)}
                              disabled={isPinned}
                              className={[
                                "w-full text-left rounded-lg border-2 p-3 transition-colors",
                                isPinned
                                  ? "border-rose-200 bg-rose-50 opacity-60 cursor-not-allowed"
                                  : "border-rose-200 bg-rose-50 hover:bg-rose-100 hover:border-rose-300",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-slate-900">
                                    Day {day.dayNumber}
                                  </div>
                                  <div className="text-[10px] text-slate-600 mt-0.5">
                                    {formatDisplayDate(day.date)}
                                  </div>
                                  {day.location && (
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      {day.location}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {isPinned ? (
                                    <span className="text-[10px] text-rose-600 font-medium">
                                      Pinned
                                    </span>
                                  ) : (
                                    <div className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      Pin here
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
