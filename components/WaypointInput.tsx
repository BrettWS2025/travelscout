// components/WaypointInput.tsx
"use client";

import { useState, useMemo, KeyboardEvent, useRef, useEffect } from "react";
import { NZ_STOPS } from "@/lib/nzStops";
import { NZ_CITIES } from "@/lib/nzCities";

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

  // Build a suggestion list from cities + stops
  const allSuggestions: Suggestion[] = useMemo(() => {
    const citySuggestions: Suggestion[] = NZ_CITIES.map((c) => ({
      id: `city-${c.id}`,
      label: c.name,
      type: "city" as const,
    }));

    const stopSuggestions: Suggestion[] = NZ_STOPS.map((s) => ({
      id: `stop-${s.id}`,
      label: s.name,
      type: "stop" as const,
    }));

    // simple concat; later we could de-dupe on label if we ever double up
    return [...citySuggestions, ...stopSuggestions];
  }, []);

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) {
      return allSuggestions
        .filter((s) => !value.includes(s.label))
        .slice(0, 8);
    }

    return allSuggestions
      .filter((s) => {
        if (value.includes(s.label)) return false;
        return s.label.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [allSuggestions, input, value]);

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
          type="text"
          className="input-dark w-full text-sm"
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
            className="absolute left-0 right-0 mt-1 card max-h-64 overflow-auto z-50"
            style={{ color: "var(--text)" }}
          >
            <ul className="divide-y divide-white/5 text-sm">
              {filteredSuggestions.map((s, idx) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/10 ${
                      idx === highlightIndex ? "bg-white/10" : ""
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
