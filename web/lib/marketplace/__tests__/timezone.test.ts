import { describe, expect, it } from "vitest";
import {
  endOfLocalDayWindowUtc,
  localDateKey,
  startOfLocalDayUtc,
  zonedLocalToUtcIso,
} from "@/lib/marketplace/timezone";

describe("zonedLocalToUtcIso", () => {
  it("maps Pacific/Auckland NZDT local times to UTC", () => {
    // NZDT = UTC+13 in October
    expect(zonedLocalToUtcIso("2026-10-22", "00:00", "Pacific/Auckland")).toBe(
      "2026-10-21T11:00:00.000Z"
    );
    expect(zonedLocalToUtcIso("2026-10-22", "23:59", "Pacific/Auckland")).toBe(
      "2026-10-22T10:59:00.000Z"
    );
  });

  it("round-trips local date key", () => {
    const start = startOfLocalDayUtc("2026-07-01", "Pacific/Auckland");
    // NZST = UTC+12 in July
    expect(start).toBe("2026-06-30T12:00:00.000Z");
    expect(localDateKey(start, "Pacific/Auckland")).toBe("2026-07-01");
    expect(endOfLocalDayWindowUtc("2026-07-01", "Pacific/Auckland")).toBe(
      "2026-07-01T11:59:00.000Z"
    );
  });
});
