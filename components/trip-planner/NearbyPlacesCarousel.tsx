"use client";

import { Star } from "lucide-react";
import type { NearbyPlace } from "@/lib/hooks/useNearbyPlaces";

type Props = {
  places?: NearbyPlace[];
  /**
   * Optional label used for accessibility and empty states.
   * Example: "Nearby restaurants"
   */
  title?: string;
};

export default function NearbyPlacesCarousel({ places = [], title }: Props) {
  if (!places || places.length === 0) return null;

  return (
    <div className="relative">
      {/* Scroll container */}
      <div
        className="flex gap-0 md:gap-4 overflow-x-auto pb-2 scroll-smooth w-full snap-x snap-mandatory"
      >
        {places.map((place) => {
          const href = place.googleMapsUri;
          return (
            <div
              key={place.id}
              data-carousel-item
              className="flex-shrink-0 w-full md:w-56 snap-start"
            >
              <div className="flex flex-col h-full rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div className="relative mx-1 mt-1 h-20 md:h-24 flex-shrink-0 bg-slate-200 rounded-lg overflow-hidden">
                  {place.imageUrl ? (
                    <img
                      src={place.imageUrl}
                      alt={place.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = "none";
                        const placeholder = target.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className={[
                      "w-full h-full flex items-center justify-center",
                      place.imageUrl ? "hidden" : "",
                    ].join(" ")}
                  >
                    <span className="text-[10px] text-slate-500">No image</span>
                  </div>
                </div>

                <div className="p-2 flex flex-col min-w-0 min-h-[76px]">
                  <h4 className="font-semibold text-slate-900 text-xs md:text-sm mb-0.5 text-left line-clamp-2">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-600 transition-colors line-clamp-2"
                      >
                        {place.name}
                      </a>
                    ) : (
                      place.name
                    )}
                  </h4>

                  {typeof place.rating === "number" ? (
                    <div className="flex items-center gap-1 text-[10px] text-slate-600 mb-1 flex-shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{place.rating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}

                  {place.address ? (
                    <p className="text-[10px] text-slate-600 line-clamp-2 min-h-[2.5rem]">{place.address}</p>
                  ) : (
                    <p className="text-[10px] text-slate-500 line-clamp-2 min-h-[2.5rem]" aria-hidden />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

