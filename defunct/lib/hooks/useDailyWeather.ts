"use client";

import { useQuery } from "@tanstack/react-query";
import type { DailyWeather } from "@/lib/weather";

type UseDailyWeatherResult = {
  weatherByDate: Record<string, DailyWeather>;
  loading: boolean;
  error: string | null;
};

async function fetchDailyWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<Record<string, DailyWeather>> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    startDate,
    endDate,
  });
  const res = await fetch(`/api/weather?${params.toString()}`);
  if (!res.ok) {
    let message = `Failed to fetch weather: ${res.statusText}`;
    try {
      const errData = await res.json();
      message = errData?.message || errData?.error || message;
    } catch {
      // keep status text
    }
    throw new Error(message);
  }
  const data = await res.json();
  if (!data?.success) {
    throw new Error(data?.message || data?.error || "Failed to fetch weather");
  }
  return data.days && typeof data.days === "object" ? data.days : {};
}

export function useDailyWeather(params: {
  lat?: number;
  lng?: number;
  startDate?: string;
  endDate?: string;
}): UseDailyWeatherResult {
  const { lat, lng, startDate, endDate } = params;
  const enabled =
    lat !== undefined &&
    lng !== undefined &&
    !!startDate &&
    !!endDate;

  const { data, isLoading, error } = useQuery({
    queryKey: ["weather", lat, lng, startDate, endDate],
    queryFn: () => fetchDailyWeather(lat as number, lng as number, startDate as string, endDate as string),
    enabled,
    staleTime: 60 * 60 * 1000,
  });

  return {
    weatherByDate: data ?? {},
    loading: enabled && isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to fetch weather"
      : null,
  };
}
