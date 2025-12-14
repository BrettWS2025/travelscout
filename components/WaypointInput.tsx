// components/WaypointInput.tsx
"use client";

import { useState, KeyboardEvent } from "react";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

export default function WaypointInput({ value, onChange, placeholder }: Props) {
  const [input, setInput] = useState("");

  function addWaypoint(name: string) {
    const cleaned = name.trim();
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    onChange([...value, cleaned]);
  }

  function removeWaypoint(name: string) {
    onChange(value.filter((w) => w !== name));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addWaypoint(input);
      setInput("");
    }
  }

  return (
    <div className="space-y-2">
      {/* Chip row */}
      <div className="flex flex-wrap gap-2">
        {value.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/20 text-[var(--text)] text-sm border border-[var(--accent)]/40"
          >
            {w}
            <button
              onClick={() => removeWaypoint(w)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Input box */}
      <input
        type="text"
        className="input-dark w-full text-sm"
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <p className="text-xs text-gray-400">
        Press <strong>Enter</strong> to add a stop.
      </p>
    </div>
  );
}
