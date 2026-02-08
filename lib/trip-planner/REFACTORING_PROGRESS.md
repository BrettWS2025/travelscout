# useTripPlanner Refactoring Progress

## Goal
Split `useTripPlanner.ts` (1874 lines) into smaller, testable hooks.

## Completed Hooks

### ✅ 1. `useTripPlannerState.ts`
**Purpose:** Core state management
- City selection state (startCityId, endCityId, startCityData, endCityData)
- Date state (startDate, endDate, dateRange, calendarMonth)
- Plan state (plan, error, hasSubmitted)
- Route state (routeStops, nightsPerStop, dayStopMeta)
- Map state (mapPoints, legs, legsLoading)
- Day details state (dayDetails, roadSectorDetails, sector types)
- UI state (addingStopAfterIndex, newStopCityId, openStops)
- Recent and suggested cities

### ✅ 2. `useTripPlannerUI.ts`
**Purpose:** UI state management
- Desktop popovers (activePill, showWherePopover, showCalendar)
- Mobile sheet (mobileSheetOpen, mobileActive)
- Where step state
- Refs for outside click detection
- Places/Things UI state
- Outside click handling
- Body scroll lock

### ✅ 3. `useTripPlannerSearch.ts`
**Purpose:** Search functionality
- Query state (startQuery, endQuery, placesQuery, thingsQuery)
- Search results (startResults, endResults, placesResults, thingsResults)
- Debounced search for cities/places
- Things filtering from NZ_STOPS

### ✅ 4. `useTripPlannerCitySelection.ts`
**Purpose:** City selection logic
- selectStartCity
- selectEndCity
- selectReturnToStart

### ✅ 5. `useTripPlannerPlaces.ts`
**Purpose:** Places and Things selection
- Selected places/things state
- selectPlace / removePlace
- selectThing / removeThing
- Selected places/things summaries

## Remaining Work

### ⏳ 6. `useTripPlannerHandlers.ts` (or integrate into UI hook)
**Purpose:** UI action handlers
- handleDateRangeChange
- openWhereDesktop / openWhenDesktop
- openPlacesDesktop / openThingsDesktop
- openMobileSheet / closeMobileSheet
- closePlacesMobileSheet / closeThingsMobileSheet

### ⏳ 7. `useTripPlannerPlan.ts`
**Purpose:** Plan generation and modification
- handleSubmit (main form submission - very complex)
- handleChangeNights
- handleRemoveStop
- handleReorderStops
- handleStartAddStop / handleConfirmAddStop / handleCancelAddStop
- toggleDayOpen / updateDayNotes / updateDayAccommodation
- toggleRoadSectorOpen / updateRoadSectorActivities
- convertStartToItinerary / convertStartToRoad
- convertEndToItinerary / convertEndToRoad
- toggleStopOpen / expandAllStops / collapseAllStops

### ⏳ 8. `useTripPlannerPersistence.ts`
**Purpose:** Save/load functionality
- saveItinerary
- loadItinerary
- saveStateToLocalStorage
- restoreStateFromLocalStorage
- clearSavedState

### ⏳ 9. Refactor main `useTripPlanner.ts`
**Purpose:** Compose all hooks
- Import all hooks
- Compose them together
- Return unified interface (maintain backward compatibility)
- Add derived values (totalTripDays, whenLabel, whereSummary, etc.)

## Next Steps

1. Create `useTripPlannerHandlers.ts` for UI handlers
2. Create `useTripPlannerPlan.ts` for plan logic (this will be large)
3. Create `useTripPlannerPersistence.ts` for save/load
4. Refactor main hook to compose everything
5. Update components that use the hook (if interface changes)
6. Add tests for each new hook

## Notes

- All new hooks should maintain the same interface as the original
- We're extracting logic, not changing behavior
- Tests should be added as we extract each piece
- The main hook will become a composition layer
