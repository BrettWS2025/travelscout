"use client";

import WaypointInput from "@/components/WaypointInput";

type Props = {
  waypoints: string[];
  onChange: (next: string[]) => void;
};

export default function WaypointsSection({ waypoints, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">Places you&apos;d like to visit</label>
      <p className="text-xs text-gray-400">
        Start typing a town or scenic stop. We&apos;ll reorder these into a logical route between
        your start and end cities where we recognise the stops, and estimate <strong>road</strong>{" "}
        driving times between each leg.
      </p>

      <WaypointInput
        value={waypoints}
        onChange={onChange}
        placeholder="Add a stop, e.g. Lake Tekapo"
      />
    </div>
  );
}
