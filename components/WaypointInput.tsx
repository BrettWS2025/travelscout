// components/WaypointInput.tsx
"use client";

import { useState, useMemo, KeyboardEvent, useRef, useEffect } from "react";
import { NZ_STOPS } from "@/lib/nzStops";
import { searchPlacesByName } from "@/lib/nzCities";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

type Suggestion = {
  id: string;
  label: string;
  type: "city" | "stop";
};

export default function WaypointInput({ value, onChange, placeholder }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [placesSearchResults, setPlacesSearchResults] = useState<Array<{ id: string; name: string }>>([]);

  // Search places from database when user types
  useEffect(() => {
    if (!input.trim()) {
      setPlacesSearchResults([]);
      return;
    }

    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(input, 20);
        setPlacesSearchResults(
          results.map((p) => ({ id: p.id, name: p.name }))
        );
      } catch (error) {
        console.error("Error searching places:", error);
        setPlacesSearchResults([]);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [input]);

  // Build suggestions from database search results + stops
  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    
    // Build suggestions from places search results
    const placeSuggestions: Suggestion[] = placesSearchResults
      .filter((p) => !value.includes(p.name))
      .map((p) => ({
        id: `city-${p.id}`,
        label: p.name,
        type: "city" as const,
      }));

    // Build suggestions from stops (filter by query if provided)
    const stopSuggestions: Suggestion[] = NZ_STOPS
      .filter((s) => {
        if (value.includes(s.name)) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q);
      })
      .map((s) => ({
        id: `stop-${s.id}`,
        label: s.name,
        type: "stop" as const,
      }));

    // Combine and limit results
    return [...placeSuggestions, ...stopSuggestions].slice(0, 8);
  }, [placesSearchResults, input, value]);

  function addWaypoint(label: string) {
    const cleaned = label.trim();
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    onChange([...value, cleaned]);
  }

  function removeWaypoint(label: string) {
    onChange(value.filter((w) => w !== label));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!filteredSuggestions.length) return;
      setHighlightIndex((prev) =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : 0
      );
      setOpen(true);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!filteredSuggestions.length) return;
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredSuggestions.length - 1
      );
      setOpen(true);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // If there is a highlighted suggestion, use that
      if (open && highlightIndex >= 0 && highlightIndex < filteredSuggestions.length) {
        const s = filteredSuggestions[highlightIndex];
        addWaypoint(s.label);
        setInput("");
        setOpen(false);
        setHighlightIndex(-1);
        return;
      }

      // Otherwise, treat as a free-form waypoint
      if (input.trim()) {
        addWaypoint(input);
        setInput("");
        setOpen(false);
        setHighlightIndex(-1);
      }
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
      return;
    }
  }

  function handleSuggestionClick(s: Suggestion) {
    addWaypoint(s.label);
    setInput("");
    setOpen(false);
    setHighlightIndex(-1);
  }

  // Close suggestions if you click outside
  useEffect(() => {
    function handleClickOutside(ev: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
        setHighlightIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Blur input on suggestions list scroll/touchmove
  useEffect(() => {
    const suggestionsEl = suggestionsRef.current;
    if (!suggestionsEl || !open) return;

    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };

    const handleTouchMove = () => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    };

    suggestionsEl.addEventListener("scroll", handleScroll);
    suggestionsEl.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      suggestionsEl.removeEventListener("scroll", handleScroll);
      suggestionsEl.removeEventListener("touchmove", handleTouchMove);
      clearTimeout(scrollTimeout);
    };
  }, [open]);

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Chip row */}
      <div className="flex flex-wrap gap-2">
        {value.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/20 text-[var(--text)] text-sm border border-[var(--accent)]/40"
          >
            {w}
            <button
              type="button"
              onClick={() => removeWaypoint(w)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Input + suggestions */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="input-dark w-full text-sm md:text-sm"
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (filteredSuggestions.length) {
              setOpen(true);
            }
          }}
        />

        {open && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 right-0 mt-1 card overflow-auto z-50"
            style={{ 
              color: "var(--text)",
              maxHeight: "calc(100dvh - 200px)"
            }}
          >
            <ul className="divide-y divide-gray-200 text-sm">
              {filteredSuggestions.map((s, idx) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-100 ${
                      idx === highlightIndex ? "bg-gray-100" : ""
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {s.type === "city" ? "City / Airport" : "Stop"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Start typing a town or stop (e.g. <strong>Tekapo</strong>,{" "}
        <strong>Wanaka</strong>, <strong>Tauranga</strong>) and press{" "}
        <strong>Enter</strong> to add it.
      </p>
    </div>
  );
}
