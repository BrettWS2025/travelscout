"use client";

import { X } from "lucide-react";
import type { WalkingExperience } from "@/lib/walkingExperiences";

type ExperienceCardProps = {
  experience: WalkingExperience;
  onRemove?: () => void;
};

export default function ExperienceCard({ experience, onRemove }: ExperienceCardProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-all max-w-full">
      {/* Image - clickable link */}
      <a
        href={experience.url_to_webpage}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 w-6 h-6 rounded overflow-hidden bg-slate-200 flex items-center justify-center hover:opacity-90 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {experience.url_to_thumbnail ? (
          <img
            src={experience.url_to_thumbnail}
            alt={experience.track_name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const placeholder = target.nextElementSibling as HTMLElement;
              if (placeholder) placeholder.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className={[
            "w-full h-full flex items-center justify-center",
            experience.url_to_thumbnail ? "hidden" : "",
          ].join(" ")}
        >
          <span className="text-[8px] text-slate-500">🏔️</span>
        </div>
      </a>
      
      {/* Name - clickable link with dynamic sizing */}
      <a
        href={experience.url_to_webpage}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2 min-w-0 flex-1"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "calc(100% - 2.5rem)" }}
      >
        {experience.track_name}
      </a>

      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Remove experience"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
