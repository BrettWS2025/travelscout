"use client";

import { Star } from "lucide-react";
import type { NearbyPlace } from "@/lib/hooks/useNearbyPlaces";

type Props = {
  places?: NearbyPlace[];
  onInterestedPlace?: (place: NearbyPlace) => void;
  onCheckOutPlace?: (place: NearbyPlace) => void;
  interestedPlaceIds?: Set<string>;
  /** When set with `places` length 1, shows a confirmation link beside Directions (manual bookings). */
  confirmationUrl?: string;
  /** Plain-text confirmation reference when `confirmationUrl` is not used. */
  confirmationRef?: string;
  /**
   * Optional label used for accessibility and empty states.
   * Example: "Nearby restaurants"
   */
  title?: string;
  /**
   * `compact`: narrower tiles; on `md+` uses equal-width columns so ~3 items fit without horizontal scroll.
   */
  size?: "default" | "compact";
  /** Show Google user rating count next to the star rating when present. */
  showUserRatingCount?: boolean;
  /** Extra "Directions" link when lat/lng are available (opens Google Maps directions). */
  showDirectionsLink?: boolean;
};

function directionsUrl(place: NearbyPlace): string | null {
  if (typeof place.lat !== "number" || typeof place.lng !== "number") return null;
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`;
}

export default function NearbyPlacesCarousel({
  places = [],
  onInterestedPlace,
  onCheckOutPlace,
  interestedPlaceIds,
  confirmationUrl,
  confirmationRef,
  title,
  size = "default",
  showUserRatingCount = false,
  showDirectionsLink = false,
}: Props) {
  if (!places || places.length === 0) return null;

  const isCompact = size === "compact";

  return (
    <div className="relative">
      <div
        role="list"
        aria-label={title}
        className={[
          "flex pb-2 scroll-smooth w-full",
          isCompact
            ? "gap-2 md:gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-x-visible md:snap-none"
            : "gap-0 md:gap-4 overflow-x-auto snap-x snap-mandatory",
        ].join(" ")}
      >
        {places.map((place) => {
          const href = place.googleMapsUri;
          const dirHref = showDirectionsLink ? directionsUrl(place) : null;
          const placeIsInterested = !!interestedPlaceIds?.has(place.id);
          const websiteHref = place.websiteUri;
          return (
            <div
              key={place.id}
              data-carousel-item
              role="listitem"
              className={[
                "flex-shrink-0 snap-start min-w-0",
                isCompact
                  ? "w-[min(82vw,200px)] sm:w-44 md:w-auto md:flex-1 md:max-w-none"
                  : "w-full md:w-56",
              ].join(" ")}
            >
              <div className="flex flex-col h-full rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div
                  className={[
                    "relative mx-1 mt-1 flex-shrink-0 bg-slate-200 rounded-lg overflow-hidden",
                    isCompact ? "h-16 md:h-[4.25rem]" : "h-20 md:h-24",
                  ].join(" ")}
                >
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

                <div
                  className={[
                    "p-2 flex flex-col min-w-0",
                    isCompact ? "min-h-[4.5rem]" : "min-h-[76px]",
                  ].join(" ")}
                >
                  <h4
                    className={[
                      "font-semibold text-slate-900 mb-0.5 text-left line-clamp-2",
                      isCompact ? "text-[11px] leading-tight" : "text-xs md:text-sm",
                    ].join(" ")}
                  >
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
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[10px] text-slate-600 mb-1 flex-shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
                      <span>{place.rating.toFixed(1)}</span>
                      {showUserRatingCount &&
                        typeof place.userRatingCount === "number" &&
                        place.userRatingCount > 0 && (
                          <span className="text-slate-400">({place.userRatingCount.toLocaleString()})</span>
                        )}
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}

                  {place.address ? (
                    <p
                      className={[
                        "text-slate-600 line-clamp-2",
                        isCompact ? "text-[10px] leading-snug min-h-[2.25rem]" : "text-[10px] min-h-[2.5rem]",
                      ].join(" ")}
                    >
                      {place.address}
                    </p>
                  ) : (
                    <p
                      className={[
                        "text-slate-500 line-clamp-2",
                        isCompact ? "text-[10px] min-h-[2.25rem]" : "text-[10px] min-h-[2.5rem]",
                      ].join(" ")}
                      aria-hidden
                    />
                  )}

                  {onInterestedPlace || websiteHref || dirHref || confirmationUrl || confirmationRef ? (
                    <div className="mt-auto pt-2 flex flex-wrap items-center justify-center gap-2">
                      {onInterestedPlace ? (
                        <button
                          type="button"
                          onClick={() => onInterestedPlace(place)}
                          disabled={placeIsInterested}
                          className={[
                            "inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors",
                            "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
                            "disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed",
                          ].join(" ")}
                        >
                          Interested
                        </button>
                      ) : null}
                      {websiteHref ? (
                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onCheckOutPlace?.(place)}
                          className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          Check it out
                        </a>
                      ) : null}
                      {dirHref ? (
                        <a
                          href={dirHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Directions
                        </a>
                      ) : null}
                      {confirmationUrl ? (
                        <a
                          href={confirmationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Confirmation
                        </a>
                      ) : confirmationRef ? (
                        <span className="text-[10px] font-medium text-slate-600" title="Booking reference">
                          Ref: {confirmationRef}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

