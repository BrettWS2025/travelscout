import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DayWeatherSummary from "../DayWeatherSummary";
import type { DailyWeather } from "@/lib/weather";

const weather: DailyWeather = {
  date: "2026-09-11",
  weatherCode: 2,
  icon: "partlyCloudy",
  description: "Partly cloudy",
  tempMax: 18.4,
  tempMin: 6.7,
};

describe("DayWeatherSummary", () => {
  it("shows the condition, forecast temperatures, and a combined accessible label", () => {
    render(<DayWeatherSummary weather={weather} />);
    expect(screen.getByText("Partly cloudy")).toBeInTheDocument();
    expect(screen.getByText("18° / 7°")).toBeInTheDocument();
    expect(screen.getByLabelText("Partly cloudy, 18° / 7°")).toBeInTheDocument();
  });
});
