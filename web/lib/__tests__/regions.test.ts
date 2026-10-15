import { describe, expect, it } from "vitest";
import {
  NZ_REGIONS,
  canonicalizeRegion,
  isValidRegion,
  mergeRegionLists,
  normalizeRegionKey,
  regionsMatch,
} from "../regions";

describe("regions", () => {
  it("canonicalizes DB-style region names with a Region suffix", () => {
    expect(canonicalizeRegion("Auckland Region")).toBe("Auckland");
    expect(canonicalizeRegion("  otago region ")).toBe("Otago");
    expect(canonicalizeRegion("Manawatu-Whanganui")).toBe("Manawatū-Whanganui");
  });

  it("rejects tourism destinations that are not official regions", () => {
    expect(canonicalizeRegion("Queenstown")).toBeNull();
    expect(canonicalizeRegion("Wānaka")).toBeNull();
    expect(isValidRegion("Rotorua")).toBe(false);
  });

  it("matches regions ignoring case and Region suffix", () => {
    expect(regionsMatch("Otago", "Otago Region")).toBe(true);
    expect(regionsMatch("Northland", "Auckland")).toBe(false);
  });

  it("keeps the static list stable and merges unknown DB values", () => {
    expect(NZ_REGIONS).toContain("Southland");
    expect(NZ_REGIONS).toHaveLength(16);
    const merged = mergeRegionLists(["Auckland Region", "Chatham Islands"]);
    expect(merged).toContain("Auckland");
    expect(merged).toContain("Chatham Islands");
    expect(normalizeRegionKey("Hawke's Bay")).toBe(
      normalizeRegionKey("Hawkes Bay")
    );
  });
});
