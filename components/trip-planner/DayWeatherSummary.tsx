"use client";

import DayWeatherIcon from "@/components/trip-planner/DayWeatherIcon";
import { formatForecastTemps, type DailyWeather } from "@/lib/weather";

type Props = {
  weather: DailyWeather;
};

export default function DayWeatherSummary({ weather }: Props) {
  const temps = formatForecastTemps(weather.tempMax, weather.tempMin);
  const label = [weather.description, temps].filter(Boolean).join(", ");

  return (
    <div className="flex items-center gap-2 min-w-0 max-w-[55%] sm:max-w-none" aria-label={label}>
      <DayWeatherIcon
        kind={weather.icon}
        description={weather.description}
        decorative
        className="w-5 h-5 md:w-6 md:h-6"
      />
      <span className="text-sm md:text-base text-slate-600 truncate">
        {weather.description}
      </span>
      {temps ? (
        <span className="text-sm md:text-base font-semibold text-slate-800 tabular-nums whitespace-nowrap">
          {temps}
        </span>
      ) : null}
    </div>
  );
}
