import { describe, expect, it, vi, beforeEach } from "vitest";
import { findNearestPlace, isInsideNewZealand, listNzRegions } from "../places";

describe("places helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects NZ bounds", () => {
    expect(isInsideNewZealand(-41.28, 174.77)).toBe(true);
    expect(isInsideNewZealand(-37.81, 144.96)).toBe(false);
  });

  it("falls back to the static region list when supabase is unavailable", async () => {
    const regions = await listNzRegions(null);
    expect(regions).toContain("Otago");
    expect(regions).toContain("Auckland");
  });

  it("maps nearest place region_name onto the canonical list", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            id: "1",
            name: "Queenstown",
            display_name: "Queenstown, Queenstown-Lakes District, Otago Region",
            lat: -45.03,
            lon: 168.66,
            region_name: "Otago Region",
            place_type: "town",
          },
        ],
        error: null,
      }),
      from: vi.fn(),
    };

    const place = await findNearestPlace(-45.03, 168.66, 50, client as never);
    expect(place?.name).toBe("Queenstown");
    expect(place?.regionName).toBe("Otago Region");
    expect(place?.region).toBe("Otago");
  });
});
