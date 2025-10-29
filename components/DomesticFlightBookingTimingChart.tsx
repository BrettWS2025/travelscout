// components/DomesticFlightBookingTimingChart.tsx
"use client";

import { useMemo } from "react";
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

/** Input shape: one point per “days before departure” */
export type PricePoint = { daysOut: number; price: number };

type Props = {
  /** Optional. If omitted, we use DEFAULT_POINTS below */
  data?: PricePoint[];
  currency?: string; // e.g. "NZD"
  dark?: boolean;    // when placed on dark cards
};

/** Built-in sample data so the component works standalone */
const DEFAULT_POINTS: PricePoint[] = [
  { daysOut: 180, price: 320 }, { daysOut: 170, price: 300 }, { daysOut: 160, price: 285 },
  { daysOut: 150, price: 270 }, { daysOut: 140, price: 260 }, { daysOut: 130, price: 245 },
  { daysOut: 120, price: 230 }, { daysOut: 110, price: 220 }, { daysOut: 100, price: 210 },
  { daysOut:  90, price: 200 }, { daysOut:  80, price: 195 }, { daysOut:  70, price: 190 },
  { daysOut:  60, price: 180 }, { daysOut:  50, price: 175 }, { daysOut:  40, price: 170 },
  { daysOut:  30, price: 165 }, { daysOut:  20, price: 160 }, { daysOut:  10, price: 175 },
];

const fmtCurrency = (v: number, currency = "NZD") =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.max(0, v || 0)
  );

/** Simple 7-day moving average to smooth noisy price series */
function smooth(points: PricePoint[], window = 7): PricePoint[] {
  if (points.length <= window) return points;
  const out: PricePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const s = Math.max(0, i - Math.floor(window / 2));
    const e = Math.min(points.length, i + Math.ceil(window / 2));
    const slice = points.slice(s, e);
    const avg = slice.reduce((a, p) => a + p.price, 0) / slice.length;
    out.push({ daysOut: points[i].daysOut, price: avg });
  }
  return out;
}

/** pick the min of the smoothed curve and define a “sweet spot” window around it */
function findSweetSpot(points: PricePoint[], padDays = 14) {
  if (!points.length) return { minIdx: 0, start: 0, end: 0 };
  let minIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].price < points[minIdx].price) minIdx = i;
  }
  const start = Math.max(0, points[minIdx].daysOut - padDays);
  const end = Math.min(points[points.length - 1].daysOut, points[minIdx].daysOut + padDays);
  return { minIdx, start, end };
}

function daysToWeeksLabel(a: number, b: number) {
  const aw = Math.round(a / 7);
  const bw = Math.round(b / 7);
  if (aw === bw) return `${aw} weeks out`;
  return `${aw}–${bw} weeks out`;
}

export default function DomesticFlightBookingTimingChart({
  data,
  currency = "NZD",
  dark = true,
}: Props) {
  // Use provided data or the built-in defaults
  const input = data && data.length ? data : DEFAULT_POINTS;

  // Defensive: sort by daysOut ascending
  const sorted = useMemo(
    () => [...input].sort((a, b) => a.daysOut - b.daysOut),
    [input]
  );

  const smoothed = useMemo(() => smooth(sorted, 7), [sorted]);
  const { minIdx, start, end } = useMemo(() => findSweetSpot(smoothed, 14), [smoothed]); // ~2-week halo
  const minPoint = smoothed[minIdx];

  const header = smoothed.length
    ? `Best time to book: ${daysToWeeksLabel(start, end)}`
    : "Best time to book";

  // Theme tokens (work on dark cards)
  const text = dark ? "var(--text)" : "#1f2937";
  const muted = dark ? "var(--muted)" : "#6b7280";
  const accent = "var(--accent)";        // your brand accent
  const grid = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
  const fillAccent = "var(--accent)";    // works in SVG
  const fillGlow = dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.02)";

  const showBand = smoothed.length > 0 && end > start;

  return (
    <div className="space-y-3">
      {/* Headline card */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: dark ? "rgba(255,255,255,.06)" : "#f8fafc", color: text }}
      >
        <div className="text-base md:text-lg font-semibold">{header}</div>
        {minPoint && (
          <div className="text-sm" style={{ color: muted }}>
            Cheapest seen: <span style={{ color: text }}>{fmtCurrency(minPoint.price, currency)}</span>{" "}
            at ~{Math.round(minPoint.daysOut / 7)} wks out
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="relative w-full h-[280px] md:h-[360px] rounded-2xl overflow-hidden"
        style={{ background: fillGlow }}
      >
        {/* Overlay badge so the “Best booking window” is always visible */}
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
          <AreaChart
            data={smoothed}
            margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
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
              formatter={(value: any) => [fmtCurrency(value as number, currency), "Smoothed price"]}
              labelFormatter={(d) => `${d} days out`}
            />

            {/* Glow/area under line */}
            <Area
              type="monotone"
              dataKey="price"
              stroke="none"
              fill="url(#priceGradient)"
              isAnimationActive={false}
            />

            {/* Trend line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke={accent}
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />

            {/* Sweet-spot highlight band (rendered AFTER line/area so it sits on top) */}
            {showBand && (
              <ReferenceArea
                x1={start}
                x2={end}
                fill={fillAccent}
                fillOpacity={0.18}
                stroke={fillAccent}
                strokeOpacity={0.28}
              />
            )}

            {/* Dot at absolute min */}
            {minPoint && (
              <ReferenceDot
                x={minPoint.daysOut}
                y={minPoint.price}
                r={5}
                fill={accent}
                stroke="white"
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tiny legend / explainer */}
      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: muted }}>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-4 h-2 rounded"
            style={{ background: "linear-gradient(180deg, var(--accent) 0%, transparent 100%)", opacity: 0.6 }}
          />
          Average price
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "var(--accent)", opacity: 0.25 }} />
          Best Time to Book
        </span>
      </div>
    </div>
  );
}
