"use client";

import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";
import type { WeatherIconKind } from "@/lib/weather";

const ICONS: Record<WeatherIconKind, LucideIcon> = {
  clear: Sun,
  partlyCloudy: CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
};

const DEFAULT_COLOR: Record<WeatherIconKind, string> = {
  clear: "text-amber-400",
  partlyCloudy: "text-amber-400",
  overcast: "text-slate-400",
  fog: "text-slate-400",
  drizzle: "text-sky-400",
  rain: "text-sky-500",
  snow: "text-sky-300",
  thunderstorm: "text-violet-400",
};

type Props = {
  kind: WeatherIconKind;
  description: string;
  selected?: boolean;
  className?: string;
  /** Hide from assistive tech when the description is shown as visible text. */
  decorative?: boolean;
};

export default function DayWeatherIcon({
  kind,
  description,
  selected = false,
  className = "w-4 h-4",
  decorative = false,
}: Props) {
  const Icon = ICONS[kind];
  const colorClass = selected ? "text-white" : DEFAULT_COLOR[kind];
  return (
    <Icon
      className={`${className} ${colorClass} flex-shrink-0`}
      aria-label={decorative ? undefined : description}
      aria-hidden={decorative || undefined}
      strokeWidth={2}
    />
  );
}
