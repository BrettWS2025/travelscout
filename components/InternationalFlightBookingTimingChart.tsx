// components/InternationalFlightBookingTimingChart.tsx
"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
} from "recharts";

export type PricePoint = { daysOut: number; price: number };

type MultiSeries = {
  economy: PricePoint[];
  premium: PricePoint[];
  business: PricePoint[];
};

type Props = {
  /** Optional override data. If omitted, DEFAULT_SERIES is used. */
  data?: MultiSeries;
  currency?: string; // e.g. "NZD"
  dark?: boolean;    // render on dark cards
};

/** New dataset (your values), averaged into 10-day buckets: 0, 10, …, 120. */
const DEFAULT_SERIES: MultiSeries = {
  economy: [
    { daysOut: 0, price: 1094.14 },
    { daysOut: 10, price: 1004.15 },
    { daysOut: 20, price: 971.71 },
    { daysOut: 30, price: 1092.36 },
    { daysOut: 40, price: 994.95 },
    { daysOut: 50, price: 1011.07 },
    { daysOut: 60, price: 919.14 },
    { daysOut: 70, price: 883.63 },
    { daysOut: 80, price: 941.10 },
    { daysOut: 90, price: 817.52 },
    { daysOut: 100, price: 850.15 },
    { daysOut: 110, price: 970.66 },
    { daysOut: 120, price: 835.30 },
  ],
  premium: [
    { daysOut: 0, price: 2225.87 },
    { daysOut: 10, price: 2095.69 },
    { daysOut: 20, price: 2137.88 },
    { daysOut: 30, price: 2153.93 },
    { daysOut: 40, price: 2307.94 },
    { daysOut: 50, price: 2286.9984 }, // keep precision if you like
    { daysOut: 60, price: 2143.03 },
    { daysOut: 70, price: 2218.09 },
    { daysOut: 80, price: 2223.87 },
    { daysOut: 90, price: 2238.97 },
    { daysOut: 100, price: 2465.26 },
    { daysOut: 110, price: 2433.00 },
    { daysOut: 120, price: 2159.41 },
  ],
  business: [
    { daysOut: 0, price: 3670.20 },
    { daysOut: 10, price: 3145.43 },
    { daysOut: 20, price: 3168.68 },
    { daysOut: 30, price: 3194.26 },
    { daysOut: 40, price: 3234.75 },
    { daysOut: 50, price: 3255.30 },
    { daysOut: 60, price: 3542.47 },
    { daysOut: 70, price: 3054.55 },
    { daysOut: 80, price: 3540.53 },
    { daysOut: 90, price: 3094.46 },
    { daysOut: 100, price: 3153.88 },
    { daysOut: 110, price: 2533.90 },
    { daysOut: 120, price: 2896.39 },
  ],
};

const fmtCurrency = (v: number, currency = "NZD") =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 })
    .format(Math.max(0, v || 0));

/** Light smoothing (3-point window works well for 10-day bins) */
function smooth(points: PricePoint[], window = 3): PricePoint[] {
  if (points.length <= window) return points;
  const half = Math.floor(window / 2);
  const out: PricePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const s = Math.max(0, i - half);
    const e = Math.min(points.length, i + half + 1);
    const slice = points.slice(s, e);
    const avg = slice.reduce((a, p) => a + p.price, 0) / slice.length;
    out.push({ daysOut: points[i].daysOut, price: avg });
  }
  return out;
}

/** Find absolute min and mark a “best booking” window around it */
function findSweetSpot(points: PricePoint[], padDays = 14) {
  if (!points.length) return { minIdx: 0, start: 0, end: 0 };
  let minIdx = 0;
  for (let i = 1; i < points.length; i++) if (points[i].price < points[minIdx].price) minIdx = i;
  const start = Math.max(0, points[minIdx].daysOut - padDays);
  const end = Math.min(points[points.length - 1].daysOut, points[minIdx].daysOut + padDays);
  return { minIdx, start, end };
}

function daysToWeeksLabel(a: number, b: number) {
  const aw = Math.round(a / 7);
  const bw = Math.round(b / 7);
  return aw === bw ? `${aw} weeks out` : `${aw}–${bw} weeks out`;
}

export default function InternationalFlightBookingTimingChart({
  data,
  currency = "NZD",
  dark = true,
}: Props) {
  const [tab, setTab] = useState<"economy" | "premium" | "business">("economy");

  const series = data ?? DEFAULT_SERIES;
  const current =
    tab === "economy" ? series.economy : tab === "premium" ? series.premium : series.business;

  // Defensive: sort and smooth
  const sorted = useMemo(() => [...current].sort((a, b) => a.daysOut - b.daysOut), [current]);
  const smoothed = useMemo(() => smooth(sorted, 3), [sorted]);
  const { minIdx, start, end } = useMemo(() => findSweetSpot(smoothed, 14), [smoothed]);
  const minPoint = smoothed[minIdx];
  const showBand = smoothed.length > 0 && end > start;

  const labels = {
    economy: "Economy",
    premium: "Premium Economy",
    business: "Business",
  } as const;

  const header =
    smoothed.length > 0
      ? `Best time to book: ${daysToWeeksLabel(start, end)}`
      : "Best time to book";

  // Theme tokens
  const text = dark ? "var(--text)" : "#1f2937";
  const muted = dark ? "var(--muted)" : "#6b7280";
  const accent = "var(--accent)";
  const grid = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
  const fillAccent = "var(--accent)";
  const fillGlow = dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.02)";

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-2">
        {(["economy", "premium", "business"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg border transition ${
              tab === key ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5"
            }`}
            style={{ color: text }}
          >
            {labels[key]}
          </button>
        ))}
      </div>

      {/* Header chip */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: dark ? "rgba(255,255,255,.06)" : "#f8fafc", color: text }}
      >
        <div className="text-base md:text-lg font-semibold">
          {header} <span style={{ color: muted }}>({labels[tab]})</span>
        </div>
        {minPoint && (
          <div className="text-sm" style={{ color: muted }}>
            Cheapest seen:{" "}
            <span style={{ color: text }}>{fmtCurrency(minPoint.price, currency)}</span>{" "}
            at ~{Math.round(minPoint.daysOut / 7)} wks out
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="relative w-full h-[280px] md:h-[360px] rounded-2xl overflow-hidden"
        style={{ background: fillGlow }}
      >
        {showBand && (
          <div
            className="absolute top-3 right-3 text-xs md:text-sm px-2.5 py-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.18)",
              color: text,
              backdropFilter: "saturate(160%) blur(6px)",
            }}
          >
            Best booking window: {daysToWeeksLabel(start, end)}
          </div>
        )}

        <ResponsiveContainer>
          <AreaChart data={smoothed} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="intl-priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillAccent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={fillAccent} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis
              dataKey="daysOut"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke={muted}
              tick={{ fill: muted, fontSize: 12 }}
              tickFormatter={(d) => `${d}`}
              label={{ value: "Days before departure", position: "insideBottomRight", offset: -2, fill: muted }}
              interval="preserveStartEnd"
            />
            <YAxis
              width={56}
              stroke={muted}
              tick={{ fill: muted, fontSize: 12 }}
              tickFormatter={(v) => fmtCurrency(v, currency)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.12)",
                background: dark ? "rgba(18,20,27,.95)" : "#fff",
                color: text,
              }}
              labelStyle={{ color: muted }}
              formatter={(value: any) => [fmtCurrency(value as number, currency), `${labels[tab]} (smoothed)`]}
              labelFormatter={(d) => `${d} days out`}
            />

            <Area type="monotone" dataKey="price" stroke="none" fill="url(#intl-priceGradient)" isAnimationActive={false} />
            <Line type="monotone" dataKey="price" stroke={accent} strokeWidth={3} dot={false} isAnimationActive={false} />

            {showBand && (
              <ReferenceArea x1={start} x2={end} fill={fillAccent} fillOpacity={0.18} stroke={fillAccent} strokeOpacity={0.28} />
            )}

            {minPoint && (
              <ReferenceDot x={minPoint.daysOut} y={minPoint.price} r={5} fill={accent} stroke="white" strokeWidth={1.5} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: muted }}>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-4 h-2 rounded"
            style={{ background: "linear-gradient(180deg, var(--accent) 0%, transparent 100%)", opacity: 0.6 }}
          />
          Average price (smoothed)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "var(--accent)", opacity: 0.25 }} />
          Best booking window
        </span>
      </div>
    </div>
  );
}
