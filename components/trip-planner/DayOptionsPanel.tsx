"use client";

import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  right?: ReactNode;
  children?: ReactNode;
};

/**
 * A small, reusable panel intended to hold day-level "options"
 * (attractions, tickets, tours, etc).
 *
 * This is intentionally generic so you can swap the contents later without
 * changing the itinerary layout.
 */
export default function DayOptionsPanel({
  title = "Options for this day",
  description = "Add attractions, activities, and tickets you want to consider.",
  right,
  children,
}: Props) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-white">{title}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{description}</div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
