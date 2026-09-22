import { describe, it, expect } from "vitest";
import { shouldClearTripPlannerDraftForPath } from "../draftStorage";

describe("shouldClearTripPlannerDraftForPath", () => {
  it("clears only for home", () => {
    expect(shouldClearTripPlannerDraftForPath("/")).toBe(true);
    expect(shouldClearTripPlannerDraftForPath("/account/profile")).toBe(false);
    expect(shouldClearTripPlannerDraftForPath("/account/itineraries")).toBe(false);
    expect(shouldClearTripPlannerDraftForPath("/auth/login")).toBe(false);
    expect(shouldClearTripPlannerDraftForPath("/trip-planner")).toBe(false);
    expect(shouldClearTripPlannerDraftForPath("")).toBe(false);
    expect(shouldClearTripPlannerDraftForPath(null)).toBe(false);
    expect(shouldClearTripPlannerDraftForPath(undefined)).toBe(false);
  });
});
