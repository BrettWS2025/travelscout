"use client";

import { ChevronDown, Car } from "lucide-react";

type RoadSectorCardProps = {
  fromStopIndex: number;
  toStopIndex: number;
  fromStopName: string;
  toStopName: string;
  isOpen: boolean;
  activities: string;
  onToggleOpen: () => void;
  onUpdateActivities: (activities: string) => void;
};

export default function RoadSectorCard({
  fromStopIndex,
  toStopIndex,
  fromStopName,
  toStopName,
  isOpen,
  activities,
  onToggleOpen,
  onUpdateActivities,
}: RoadSectorCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Road sector header - thinner than itinerary sectors */}
      <div className="px-3 md:px-4 py-2">
        {/* Mobile: Just car icon and dropdown arrow */}
        <div className="md:hidden flex items-center gap-2">
          <Car className="w-4 h-4 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 min-w-0 flex-1 group"
          >
            <span
              className={[
                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0",
                "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
              ].join(" ")}
              aria-hidden
            >
              <ChevronDown
                className={[
                  "w-3 h-3 text-slate-600 transition-transform duration-200",
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </span>
          </button>
        </div>

        {/* Desktop: Route text, car icon, and dropdown arrow */}
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <Car className="w-4 h-4 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 min-w-0 group"
          >
            <span
              className={[
                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
              ].join(" ")}
              aria-hidden
            >
              <ChevronDown
                className={[
                  "w-3 h-3 text-slate-600 transition-transform duration-200",
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-800 truncate">
                {fromStopName} to {toStopName}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Road sector content (animated collapse) */}
      <div
        className={[
          "grid transition-[grid-template-rows] duration-250 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="px-3 md:px-4 pb-3">
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-900">
                  Activities
                </label>
                <textarea
                  rows={3}
                  className="input-dark w-full text-xs"
                  placeholder="e.g. Stop at lookout point, visit winery, lunch break..."
                  value={activities}
                  onChange={(e) => onUpdateActivities(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
