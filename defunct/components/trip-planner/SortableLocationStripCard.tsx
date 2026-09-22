"use client";

import { memo, type CSSProperties } from "react";
import { Calendar } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatShortRangeDate } from "@/lib/trip-planner/utils";

export type LocationStripBox = {
  stopIndex: number;
  cityId: string;
  cityName: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  dayIndices: number[];
};

type FaceProps = {
  location: LocationStripBox;
  isActive: boolean;
  imgUrl?: string;
  onChangeNights?: (stopIndex: number, newValue: number) => void;
  /** overlay = floating drag preview (no +/−, no pointer events) */
  presentation?: "strip" | "overlay";
  className?: string;
};

/** Shared visuals for strip + DragOverlay preview */
export const LocationStripCardFace = memo(function LocationStripCardFace({
  location,
  isActive,
  imgUrl,
  onChangeNights,
  presentation = "strip",
  className = "",
}: FaceProps) {
  const isOverlay = presentation === "overlay";
  const showNightControls = !isOverlay && onChangeNights;

  return (
    <div
      className={[
        "relative flex min-w-0 w-full flex-col rounded-xl overflow-hidden bg-white border text-left",
        "transition-[box-shadow,border-color] duration-150 ease-out",
        isActive ? "border-indigo-500 shadow-md" : "border-slate-200 shadow-sm",
        isOverlay ? "pointer-events-none shadow-2xl ring-2 ring-indigo-200/70" : "",
        className,
      ].join(" ")}
    >
      <div className="relative mx-1 mt-1 h-20 md:h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden">
        <div
          className="w-full h-full flex items-center justify-center"
          data-placeholder="true"
          style={{ display: imgUrl ? "none" : "flex" }}
        >
          <div className="text-slate-400 text-xs">Image</div>
        </div>

        {imgUrl ? (
          <img
            src={imgUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = "none";
              const placeholder = target.parentElement?.querySelector(
                '[data-placeholder="true"]'
              ) as HTMLElement | null;
              if (placeholder) placeholder.style.display = "flex";
            }}
          />
        ) : null}

        {isActive ? (
          <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded z-10">
            ACTIVE
          </div>
        ) : null}
      </div>

      <div className="min-w-0 p-2">
        <h3 className="mb-0.5 truncate font-semibold text-slate-900 text-xs md:text-sm">
          {location.cityName}
        </h3>

        {location.arrivalDate && location.departureDate ? (
          <div className="flex min-w-0 flex-nowrap items-center gap-1 text-[10px] md:text-xs text-slate-600">
            <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {formatShortRangeDate(location.arrivalDate)} –{" "}
              {formatShortRangeDate(location.departureDate)}
            </span>
            <span className="flex-shrink-0 text-slate-400">•</span>
            <div className="flex flex-shrink-0 items-center gap-1">
              <span className="whitespace-nowrap text-slate-500">
                {location.nights}{" "}
                {location.nights === 1 ? "Night" : "Nights"}
              </span>
              {showNightControls ? (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeNights!(location.stopIndex, location.nights - 1);
                    }}
                    className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded border border-slate-200 text-[10px] cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeNights!(location.stopIndex, location.nights + 1);
                    }}
                    className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded border border-slate-200 text-[10px] cursor-pointer"
                  >
                    +
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

type Props = {
  location: LocationStripBox;
  routeStopsLength: number;
  isActive: boolean;
  imgUrl?: string;
  onSelect: () => void;
  onChangeNights: (stopIndex: number, newValue: number) => void;
};

function SortableLocationStripCardInner({
  location,
  routeStopsLength,
  isActive,
  imgUrl,
  onSelect,
  onChangeNights,
}: Props) {
  const canDrag =
    routeStopsLength >= 3 &&
    location.stopIndex >= 1 &&
    location.stopIndex <= routeStopsLength - 2;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: location.stopIndex,
    disabled: !canDrag,
    transition: {
      duration: 160,
      easing: "cubic-bezier(0.25, 1, 0.45, 1)",
    },
  });

  const style: CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    willChange: transform ? "transform" : undefined,
  };

  return (
    <div
      className={[
        "relative flex-shrink-0 w-52 md:w-56 snap-start",
        isDragging ? "z-10" : "",
      ].join(" ")}
    >
      <div
        ref={setNodeRef}
        style={style}
        {...(canDrag ? { ...attributes, ...listeners } : {})}
        role="button"
        tabIndex={0}
        aria-grabbed={canDrag ? isDragging : undefined}
        aria-label={`${location.cityName}, ${isActive ? "selected, " : ""}${canDrag ? "drag to reorder" : "select"}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={[
          "touch-manipulation outline-none rounded-xl",
          "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        ].join(" ")}
      >
        <LocationStripCardFace
          location={location}
          isActive={isActive}
          imgUrl={imgUrl}
          onChangeNights={onChangeNights}
          presentation="strip"
        />
      </div>
    </div>
  );
}

export default memo(SortableLocationStripCardInner);
