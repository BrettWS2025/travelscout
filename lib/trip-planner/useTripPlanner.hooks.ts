import { useEffect, useRef, useState } from "react";
import { searchPlacesByName } from "@/lib/nzCities";
import type { CityLite } from "@/lib/trip-planner/utils";

export function usePlaceSearch(query: string): CityLite[] {
  const [searchResults, setSearchResults] = useState<CityLite[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(query, 20);
        setSearchResults(
          results.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))
        );
      } catch (error) {
        console.error("Error searching places:", error);
        setSearchResults([]);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return searchResults;
}

export function useOutsideClick(
  refs: Array<React.RefObject<HTMLElement | null>>,
  onOutsideClick: () => void,
  dependencies: any[] = []
) {
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      // Check if clicking on a button or interactive element - don't close if so
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button") || target.closest("input")) {
        return;
      }

      const isInside = refs.some((ref) => ref.current?.contains(t));
      if (!isInside) {
        onOutsideClick();
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isLocked]);
}
