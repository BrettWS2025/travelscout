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

type DuoPoint = { daysOut: number; anz?: number | null; jet?: number | null };

type Props = {
  currency?: string; // e.g. "NZD"
  dark?: boolean;    // render on dark cards
  /** Optional override: pass your own already-bucketed series (same shape). */
  data?: DuoPoint[];
};

/** 10-day bucket means (0,10,…,170) computed from your raw series */
const DEFAULT_POINTS: DuoPoint[] = [
  { daysOut: 0,   anz: 298.699, jet: 145.726 },
  { daysOut: 10,  anz: 244.380, jet: 108.815 },
  { daysOut: 20,  anz: 211.568, jet: 90.182 },
  { daysOut: 30,  anz: 196.810, jet: 87.923 },
  { daysOut: 40,  anz: 183.620, jet: 82.580 },
  { daysOut: 50,  anz: 178.018, jet: 86.807 },
  { daysOut: 60,  anz: 172.476, jet: 84.399 },
  { daysOut: 70,  anz: 165.176, jet: 81.922 },
  { daysOut: 80,  anz: 166.939, jet: 83.049 },
  { daysOut: 90,  anz: 163.737, jet: 74.288 },
  { daysOut: 100, anz: 159.688, jet: 87.571 },
  { daysOut: 110, anz: 159.711, jet: 71.852 },
  { daysOut: 120, anz: 158.518, jet: 80.788 },
];

const fmtCurrency = (v: number, currency = "NZD") =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 })
    .format(Math.max(0, v || 0));

/** Moving average smoothing on a numeric array (keeps x values from src) */
function smoothSeries(points: { x: number; y: number }[], window = 3) {
  if (points.length <= window) return points;
  const half = Math.floor(window / 2);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const s = Math.max(0, i - half);
    const e = Math.min(points.length, i + half + 1);
    const slice = points.slice(s, e);
    const avg = slice.reduce((a, p) => a + p.y, 0) / slice.length;
    out.push({ x: points[i].x, y: avg });
  }
  return out;
}

/** Based on the cheaper-of-two smoothed series at each x */
function computeBestWindow(
  merged: { daysOut: number; cheaper: number }[],
  padDays = 14
) {
  if (!merged.length) return { minIdx: 0, start: 0, end: 0 };
  let minIdx = 0;
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].cheaper < merged[minIdx].cheaper) minIdx = i;
  }
  const minX = merged[minIdx].daysOut;
  const start = Math.max(0, minX - padDays);
  const end = Math.min(merged[merged.length - 1].daysOut, minX + padDays);
  return { minIdx, start, end };
}

function weeksLabel(a: number, b: number) {
  const aw = Math.round(a / 7);
  const bw = Math.round(b / 7);
  return aw === bw ? `${aw} weeks out` : `${aw}–${bw} weeks out`;
}

export default function DomesticFlightBookingTimingChart({
  currency = "NZD",
  dark = true,
  data = DEFAULT_POINTS,
}: Props) {
  // Theme tokens
  const text = dark ? "var(--text)" : "#1f2937";
  const muted = dark ? "var(--muted)" : "#6b7280";
  const accent1 = "var(--accent)";              // Air New Zealand line & area
  const accent2 = "var(--jetstar, #ff6f00)";    // Jetstar orange (add --jetstar to theme if desired)
  const grid = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";

  // Build separate series for smoothing
  const anzSeries = useMemo(
    () =>
      data
        .filter((d) => typeof d.anz === "number")
        .map((d) => ({ x: d.daysOut, y: d.anz as number })),
    [data]
  );
  const jetSeries = useMemo(
    () =>
      data
        .filter((d) => typeof d.jet === "number")
        .map((d) => ({ x: d.daysOut, y: d.jet as number })),
    [data]
  );

  // Light smoothing (3-point window works well for 10-day bins)
  const anzSmooth = useMemo(() => smoothSeries(anzSeries, 3), [anzSeries]);
  const jetSmooth = useMemo(() => smoothSeries(jetSeries, 3), [jetSeries]);

  // Merge onto a single array keyed by daysOut for the chart
  const chart = useMemo(() => {
    const map = new Map<number, { daysOut: number; anz?: number; jet?: number }>();
    for (const p of anzSmooth) map.set(p.x, { daysOut: p.x, anz: p.y });
    for (const p of jetSmooth) {
      const existing = map.get(p.x);
      if (existing) existing.jet = p.y;
      else map.set(p.x, { daysOut: p.x, jet: p.y });
    }
    return [...map.values()].sort((a, b) => a.daysOut - b.daysOut);
  }, [anzSmooth, jetSmooth]);

  // Compute “cheaper of two” for the best-booking band
  const cheaper = useMemo(
    () =>
      chart
        .map((d) => {
          const vals = [d.anz, d.jet].filter((v): v is number => typeof v === "number");
          if (!vals.length) return null;
          return { daysOut: d.daysOut, cheaper: Math.min(...vals) };
        })
        .filter((x): x is { daysOut: number; cheaper: number } => !!x),
    [chart]
  );

  const { minIdx, start, end } = useMemo(() => computeBestWindow(cheaper, 14), [cheaper]);
  const minObj = cheaper[minIdx];

  // Find individual mins for dot markers
  const anzMin = useMemo(() => {
    if (!anzSmooth.length) return null;
    let idx = 0;
    for (let i = 1; i < anzSmooth.length; i++) if (anzSmooth[i].y < anzSmooth[idx].y) idx = i;
    return anzSmooth[idx];
  }, [anzSmooth]);

  const jetMin = useMemo(() => {
    if (!jetSmooth.length) return null;
    let idx = 0;
    for (let i = 1; i < jetSmooth.length; i++) if (jetSmooth[i].y < jetSmooth[idx].y) idx = i;
    return jetSmooth[idx];
  }, [jetSmooth]);

  const header =
    minObj ? `Best time to book: ${weeksLabel(start, end)}` : "Best time to book";

  return (
    <div className="space-y-3">
      {/* Header chip */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: dark ? "rgba(255,255,255,.06)" : "#f8fafc", color: text }}
      >
        <div className="text-base md:text-lg font-semibold">{header}</div>
        {minObj && (
          <div className="text-sm" style={{ color: muted }}>
            Cheapest seen:{" "}
            <span style={{ color: text }}>{fmtCurrency(minObj.cheaper, currency)}</span>{" "}
            at ~{Math.round(minObj.daysOut / 7)} wks out
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="relative w-full h-[280px] md:h-[360px] rounded-2xl overflow-hidden"
        style={{ background: dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.02)" }}
      >
        {minObj && (
          <div
            className="absolute top-3 right-3 text-xs md:text-sm px-2.5 py-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.18)",
              color: text,
              backdropFilter: "saturate(160%) blur(6px)",
            }}
          >
            Best booking window: {weeksLabel(start, end)}
          </div>
        )}

        <ResponsiveContainer>
          <AreaChart data={chart} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="nz-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent1} stopOpacity={0.28} />
                <stop offset="100%" stopColor={accent1} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="js-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent2} stopOpacity={0.20} />
                <stop offset="100%" stopColor={accent2} stopOpacity={0.02} />
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
              tickFormatter={(v) => fmtCurrency(v as number, currency)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.12)",
                background: dark ? "rgba(18,20,27,.95)" : "#fff",
                color: text,
              }}
              labelStyle={{ color: muted }}
              formatter={(value: any, name: any) => [
                fmtCurrency(value as number, currency),
                name === "anz" ? "Air New Zealand" : "Jetstar",
              ]}
              labelFormatter={(d) => `${d} days out`}
            />

            {/* Best-window band (based on cheaper-of-two) */}
            {minObj && (
              <ReferenceArea
                x1={start}
                x2={end}
                fill={accent1}
                fillOpacity={0.12}
                stroke={accent1}
                strokeOpacity={0.18}
              />
            )}

            {/* Faint fills for both series */}
            <Area type="monotone" dataKey="anz" stroke="none" fill="url(#nz-fill)" isAnimationActive={false} />
            <Area type="monotone" dataKey="jet" stroke="none" fill="url(#js-fill)" isAnimationActive={false} />

            {/* Lines */}
            <Line type="monotone" dataKey="anz" stroke={accent1} strokeWidth={3} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="jet" stroke={accent2} strokeWidth={3} dot={false} isAnimationActive={false} strokeDasharray="6 6" />

            {/* Min dots for each carrier */}
            {anzMin && (
              <ReferenceDot x={anzMin.x} y={anzMin.y} r={5} fill={accent1} stroke="white" strokeWidth={1.5} />
            )}
            {jetMin && (
              <ReferenceDot x={jetMin.x} y={jetMin.y} r={5} fill={accent2} stroke="white" strokeWidth={1.5} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — dot markers; Jetstar = orange */}
      <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: muted }}>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: accent1 }} />
          Air New Zealand
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: accent2 }} />
          Jetstar
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "var(--accent)", opacity: 0.25 }} />
          Best booking window (cheapest of the two)
        </span>
      </div>
    </div>
  );
}
