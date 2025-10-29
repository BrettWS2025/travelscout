// components/WhenToBookCarousel.tsx
"use client";

import { useState } from "react";

type Item = {
  key: string;
  title: string;
  node: React.ReactNode;
};

export default function WhenToBookCarousel({ items }: { items: Item[] }) {
  const [i, setI] = useState(0);
  const total = items.length;

  const prev = () => setI((p) => (p - 1 + total) % total);
  const next = () => setI((p) => (p + 1) % total);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            className="px-3 py-1 rounded-lg border border-white/20"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="px-3 py-1 rounded-lg border border-white/20"
            aria-label="Next"
          >
            ›
          </button>
        </div>
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          {i + 1} / {total}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        {items[i].title}
      </h3>

      {/* Active slide */}
      <div>{items[i].node}</div>

      {/* Dots with labels */}
      <div className="flex flex-wrap items-center gap-2">
        {items.map((it, idx) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setI(idx)}
            className={`px-2 py-1 rounded ${idx === i ? "bg-white/20" : "bg-white/10"}`}
            aria-current={idx === i ? "page" : undefined}
            title={it.title}
          >
            <span className="text-xs" style={{ color: "var(--text)" }}>
              {idx + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
