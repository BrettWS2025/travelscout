import { describe, it, expect } from "vitest";
import {
  addDaysToIsoDate,
  buildDailyWeatherByDate,
  clampToForecastWindow,
  daysInclusive,
  isIsoDate,
  utcIsoDate,
  weatherCodeToMeta,
  parseOpenMeteoAllowedRange,
} from "@/lib/weather";

describe("weather", () => {
  describe("weatherCodeToMeta", () => {
    it("maps clear, cloud, rain, snow, and storm codes", () => {
      expect(weatherCodeToMeta(0)).toEqual({ icon: "clear", description: "Clear sky" });
      expect(weatherCodeToMeta(1).icon).toBe("partlyCloudy");
      expect(weatherCodeToMeta(3).icon).toBe("overcast");
      expect(weatherCodeToMeta(45).icon).toBe("fog");
      expect(weatherCodeToMeta(51).icon).toBe("drizzle");
      expect(weatherCodeToMeta(61).icon).toBe("rain");
      expect(weatherCodeToMeta(80).icon).toBe("rain");
      expect(weatherCodeToMeta(71).icon).toBe("snow");
      expect(weatherCodeToMeta(95).icon).toBe("thunderstorm");
      expect(weatherCodeToMeta(99).icon).toBe("thunderstorm");
    });
  });

  describe("clampToForecastWindow", () => {
    it("returns the requested range when it sits inside the forecast window", () => {
      expect(clampToForecastWindow("2026-09-11", "2026-09-15", "2026-09-06")).toEqual({
        startDate: "2026-09-11",
        endDate: "2026-09-15",
      });
    });

    it("clips a stay that extends past the 16-day forecast horizon", () => {
      expect(clampToForecastWindow("2026-09-11", "2026-09-25", "2026-09-06")).toEqual({
        startDate: "2026-09-11",
        endDate: "2026-09-21",
      });
    });

    it("returns null when the trip is entirely beyond the forecast window", () => {
      expect(clampToForecastWindow("2026-12-01", "2026-12-05", "2026-09-06")).toBeNull();
    });

    it("clips a range that starts before the 92-day lookback", () => {
      const today = "2026-09-06";
      const tooOld = addDaysToIsoDate(today, -100);
      const stillValid = addDaysToIsoDate(today, -10);
      const clamped = clampToForecastWindow(tooOld, stillValid, today);
      expect(clamped).toEqual({
        startDate: addDaysToIsoDate(today, -92),
        endDate: stillValid,
      });
    });
  });

  describe("buildDailyWeatherByDate", () => {
    it("pairs Open-Meteo daily arrays into a date map", () => {
      const byDate = buildDailyWeatherByDate(
        ["2026-09-11", "2026-09-12"],
        [0, 61]
      );
      expect(byDate["2026-09-11"]?.icon).toBe("clear");
      expect(byDate["2026-09-12"]?.icon).toBe("rain");
    });

    it("skips malformed rows", () => {
      expect(buildDailyWeatherByDate(["nope"], [0])).toEqual({});
      expect(buildDailyWeatherByDate(["2026-09-11"], [null])).toEqual({});
    });
  });

  describe("date helpers", () => {
    it("validates ISO dates and counts inclusive days", () => {
      expect(isIsoDate("2026-09-06")).toBe(true);
      expect(isIsoDate("06-09-2026")).toBe(false);
      expect(daysInclusive("2026-09-11", "2026-09-15")).toBe(5);
      expect(utcIsoDate(new Date("2026-09-06T12:00:00Z"))).toBe("2026-09-06");
    });

    it("parses Open-Meteo allowed-range error text", () => {
      expect(
        parseOpenMeteoAllowedRange(
          'Parameter \'end_date\' is out of allowed range from 2026-06-05 to 2026-09-21'
        )
      ).toEqual({ startDate: "2026-06-05", endDate: "2026-09-21" });
    });
  });
});
