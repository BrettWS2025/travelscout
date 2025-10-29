// components/AusPacificFlightBookingTimingChart.tsx
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

export type PricePoint = { daysOut: number; price: number };

type Props = {
  data?: PricePoint[];     // Optional; falls back to DEFAULT_POINTS
  currency?: string;       // e.g. "NZD"
  dark?: boolean;          // when placed on dark cards
};

/** Australia & Pacific dataset, averaged into 10-day buckets */
const DEFAULT_POINTS: PricePoint[] = [
  { daysOut: 0,   price: 640.88433193 },
  { daysOut: 10,  price: 557.20266548 },
  { daysOut: 20,  price: 489.35077743 },
  { daysOut: 30,  price: 472.41847821 },
  { daysOut: 40,  price: 452.92372895 },
  { daysOut: 50,  price: 421.26791271 },
  { daysOut: 60,  price: 464.36406394 },
  { daysOut: 70,  price: 404.30105780 },
  { daysOut: 80,  price: 557.53709524 },
  { daysOut: 90,  price: 504.12112343 },
  { daysOut: 100, price: 384.81376743 },
  { daysOut: 110, price: 442.90193125 },
  { daysOut: 120, price: 399.63411272 },
  { daysOut: 130, price: 415.99310880 },
  { daysOut: 140, price: 440.04200000 },
  { daysOut: 150, price: 411.79111110 },
  { daysOut: 160, price: 459.76277778 },
  { daysOut: 170, price: 282.85500000 },
];

const fmtCurrency = (v: number, currency = "NZD") =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 })
    .format(Math.max(0, v || 0));

/** Light smoothing (3-point window suits 10-day buckets) */
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

export default function AusPacificFlightBookingTimingChart({
  data,
  currency = "NZD",
  dark = true,
}: Props) {
  const input = data?.length ? data : DEFAULT_POINTS;
  const sorted = useMemo(() => [...input].sort((a, b) => a.daysOut - b.daysOut), [input]);
  const smoothed = useMemo(() => smooth(sorted, 3), [sorted]);
  const { minIdx, start, end } = useMemo(() => findSweetSpot(smoothed, 14), [smoothed]);
  const minPoint = smoothed[minIdx];
  const showBand = smoothed.length > 0 && end > start;

  const header = smoothed.length
    ? `Best time to book: ${daysToWeeksLabel(start, end)}`
    : "Best time to book";

  // Theme
  const text = dark ? "var(--text)" : "#1f2937";
  const muted = dark ? "var(--muted)" : "#6b7280";
  const accent = "var(--accent)";
  const grid = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
  const fillAccent = "var(--accent)";
  const fillGlow = dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.02)";

  return (
    <div className="space-y-3">
      {/* Headline card */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3"
           style={{ background: dark ? "rgba(255,255,255,.06)" : "#f8fafc", color: text }}>
        <div className="text-base md:text-lg font-semibold">{header}</div>
        {minPoint && (
          <div className="text-sm" style={{ color: muted }}>
            Cheapest seen: <span style={{ color: text }}>{fmtCurrency(minPoint.price, currency)}</span>{" "}
            at ~{Math.round(minPoint.daysOut / 7)} wks out
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="relative w-full h-[280px] md:h-[360px] rounded-2xl overflow-hidden" style={{ background: fillGlow }}>
        {showBand && (
          <div className="absolute top-3 right-3 text-xs md:text-sm px-2.5 py-1.5 rounded-full"
               style={{ background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.18)",
                        color: text, backdropFilter: "saturate(160%) blur(6px)" }}>
            Best booking window: {daysToWeeksLabel(start, end)}
          </div>
        )}

        <ResponsiveContainer>
          <AreaChart data={smoothed} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="ap-priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={fillAccent} stopOpacity={0.35} />
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

            <Area type="monotone" dataKey="price" stroke="none" fill="url(#ap-priceGradient)" isAnimationActive={false} />
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
          <span className="inline-block w-4 h-2 rounded"
                style={{ background: "linear-gradient(180deg, var(--accent) 0%, transparent 100%)", opacity: 0.6 }} />
          Average price
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "var(--accent)", opacity: 0.25 }} />
          Best booking window
        </span>
      </div>
    </div>
  );
}
