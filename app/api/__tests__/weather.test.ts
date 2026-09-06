import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../weather/route";

const mockEnforceBffRateLimit = vi.fn();
vi.mock("@/lib/bff-rate-limit", () => ({
  enforceBffRateLimit: (...args: unknown[]) => mockEnforceBffRateLimit(...args),
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => null,
}));

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("/api/weather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceBffRateLimit.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 400 when lat/lng are missing", async () => {
    const start = isoDaysFromNow(1);
    const end = isoDaysFromNow(2);
    const response = await GET(
      new Request(`http://localhost/api/weather?startDate=${start}&endDate=${end}`)
    );
    expect(response.status).toBe(400);
  });

  it("returns mapped daily weather from Open-Meteo", async () => {
    const start = isoDaysFromNow(1);
    const end = isoDaysFromNow(2);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        daily: {
          time: [start, end],
          weather_code: [0, 61],
        },
      })
    );

    const response = await GET(
      new Request(`http://localhost/api/weather?lat=-41.29&lng=174.78&startDate=${start}&endDate=${end}`)
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.days[start].icon).toBe("clear");
    expect(data.days[end].icon).toBe("rain");
    expect(fetch).toHaveBeenCalledTimes(1);
    const calledUrl = String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("api.open-meteo.com/v1/forecast");
    expect(calledUrl).toContain("daily=weather_code");
  });

  it("retries with Open-Meteo's allowed range when the first request is out of bounds", async () => {
    const start = isoDaysFromNow(1);
    const end = isoDaysFromNow(2);
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: true,
            reason: `Parameter 'end_date' is out of allowed range from ${start} to ${end}`,
          },
          false,
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          daily: { time: [start], weather_code: [2] },
        })
      );

    const response = await GET(
      new Request(`http://localhost/api/weather?lat=-41.29&lng=174.78&startDate=${start}&endDate=${end}`)
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.days[start].icon).toBe("partlyCloudy");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
