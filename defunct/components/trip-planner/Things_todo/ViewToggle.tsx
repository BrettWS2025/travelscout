"use client";

type ViewToggleProps = {
  view: "itinerary" | "thingsToDo";
  onViewChange: (view: "itinerary" | "thingsToDo") => void;
  sectorType: "itinerary" | "road";
};

export default function ViewToggle({
  view,
  onViewChange,
  sectorType,
}: ViewToggleProps) {
  const leftLabel = sectorType === "itinerary" ? "Itinerary" : "Road Trip";
  const rightLabel = "Things to do";

  return (
    <div className="flex items-center gap-2 mb-3">
      <button
        type="button"
        onClick={() => onViewChange("itinerary")}
        className={[
          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          view === "itinerary"
            ? "bg-slate-200 text-slate-900 border border-slate-300"
            : "bg-transparent text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300",
        ].join(" ")}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onViewChange("thingsToDo")}
        className={[
          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          view === "thingsToDo"
            ? "bg-slate-200 text-slate-900 border border-slate-300"
            : "bg-transparent text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300",
        ].join(" ")}
      >
        {rightLabel}
      </button>
    </div>
  );
}
