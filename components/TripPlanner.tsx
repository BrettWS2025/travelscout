"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import WhereWhenPicker from "@/components/trip-planner/WhereWhenPicker";
import PlacesThingsPicker from "@/components/trip-planner/PlacesThingsPicker";
import DraftItinerary from "@/components/trip-planner/DraftItinerary";
import RouteOverview from "@/components/trip-planner/RouteOverview";
import TripSummary from "@/components/trip-planner/TripSummary";
import { useTripPlanner } from "@/lib/trip-planner/useTripPlanner";
import { useAuth } from "@/components/AuthProvider";
import type { TripInput } from "@/lib/itinerary";

type ItineraryData = {
  id: string;
  title: string;
  trip_input: TripInput;
  trip_plan: any;
  created_at: string;
};

type TripPlannerProps = {
  initialItinerary?: ItineraryData | null;
};

export default function TripPlanner({ initialItinerary }: TripPlannerProps = {}) {
  const tp = useTripPlanner();
  const { user } = useAuth();
  const router = useRouter();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [itineraryLoaded, setItineraryLoaded] = useState(false);
  const [stateRestored, setStateRestored] = useState(false);

  // Restore state from localStorage on mount (if not loading initialItinerary)
  useEffect(() => {
    if (!initialItinerary && !stateRestored) {
      const restored = tp.restoreStateFromLocalStorage();
      if (restored) {
        setStateRestored(true);
      }
    }
  }, [initialItinerary, stateRestored, tp]);

  // Load initial itinerary if provided
  useEffect(() => {
    if (initialItinerary && !itineraryLoaded) {
      const result = tp.loadItinerary(initialItinerary.trip_input, initialItinerary.trip_plan);
      if (result.success) {
        setItineraryLoaded(true);
      } else {
        console.error("Failed to load itinerary:", result.error);
      }
    }
  }, [initialItinerary, itineraryLoaded, tp]);

  const handleSaveClick = () => {
    if (!user) {
      // Save current state to localStorage before redirecting
      tp.saveStateToLocalStorage();
      
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent("/trip-planner");
      router.push(`/auth/login?returnTo=${returnUrl}`);
      return;
    }
    // Use existing title if editing, otherwise generate default
    const defaultTitle = initialItinerary?.title || (tp.startCity && tp.endCity
      ? `Trip from ${tp.startCity.name} to ${tp.endCity.name}`
      : "My Trip");
    setSaveTitle(defaultTitle);
    setShowSaveDialog(true);
    setSaveSuccess(false);
  };

  const handleSaveConfirm = async () => {
    if (!saveTitle.trim()) {
      alert("Please enter a title for your itinerary");
      return;
    }

    const result = await tp.saveItinerary(saveTitle.trim(), initialItinerary?.id);
    if (result.success) {
      // Clear saved draft state after successful save
      tp.clearSavedState();
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveDialog(false);
        setSaveSuccess(false);
        setSaveTitle("");
      }, 1500);
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={tp.handleSubmit}
        className="card p-4 md:p-6 space-y-6"
        style={{ color: "var(--text)" }}
      >
        <WhereWhenPicker
          whereRef={tp.whereRef}
          whenRef={tp.whenRef}
          activePill={tp.activePill}
          showWherePopover={tp.showWherePopover}
          showCalendar={tp.showCalendar}
          mobileSheetOpen={tp.mobileSheetOpen}
          mobileActive={tp.mobileActive}
          whereStep={tp.whereStep}
          startQuery={tp.startQuery}
          endQuery={tp.endQuery}
          recent={tp.recent}
          suggested={tp.suggested}
          startResults={tp.startResults}
          endResults={tp.endResults}
          startCityId={tp.startCityId}
          endCityId={tp.endCityId}
          dateRange={tp.dateRange}
          calendarMonth={tp.calendarMonth}
          whereSummary={tp.whereSummary}
          whenLabel={tp.whenLabel}
          totalTripDays={tp.totalTripDays}
          setMobileActive={tp.setMobileActive}
          setShowCalendar={tp.setShowCalendar}
          setActivePill={tp.setActivePill}
          setStartQuery={tp.setStartQuery}
          setEndQuery={tp.setEndQuery}
          openMobileSheet={tp.openMobileSheet}
          closeMobileSheet={tp.closeMobileSheet}
          openWhereDesktop={tp.openWhereDesktop}
          openWhenDesktop={tp.openWhenDesktop}
          selectStartCity={tp.selectStartCity}
          selectEndCity={tp.selectEndCity}
          selectReturnToStart={tp.selectReturnToStart}
          setWhereStep={tp.setWhereStep}
          handleDateRangeChange={tp.handleDateRangeChange}
          setDateRange={tp.setDateRange}
          setCalendarMonth={tp.setCalendarMonth}
          clearDates={() => {
            tp.setDateRange(undefined);
            tp.setStartDate("");
            tp.setEndDate("");
            tp.setCalendarMonth(new Date());
          }}
        />

        <PlacesThingsPicker
          placesRef={tp.placesRef}
          thingsRef={tp.thingsRef}
          activePill={tp.activePlacesThingsPill}
          showPlacesPopover={tp.showPlacesPopover}
          showThingsPopover={tp.showThingsPopover}
          placesMobileSheetOpen={tp.placesMobileSheetOpen}
          thingsMobileSheetOpen={tp.thingsMobileSheetOpen}
          placesQuery={tp.placesQuery}
          thingsQuery={tp.thingsQuery}
          placesResults={tp.placesResults}
          thingsResults={tp.thingsResults}
          recent={tp.recent}
          suggested={tp.suggested}
          selectedPlaceIds={tp.selectedPlaceIds}
          selectedThingIds={tp.selectedThingIds}
          placesSummary={tp.placesSummary}
          thingsSummary={tp.thingsSummary}
          setPlacesQuery={tp.setPlacesQuery}
          setThingsQuery={tp.setThingsQuery}
          setActivePill={tp.setActivePlacesThingsPill}
          setShowPlacesPopover={tp.setShowPlacesPopover}
          setShowThingsPopover={tp.setShowThingsPopover}
          openPlacesDesktop={tp.openPlacesDesktop}
          openThingsDesktop={tp.openThingsDesktop}
          closePlacesMobileSheet={tp.closePlacesMobileSheet}
          closeThingsMobileSheet={tp.closeThingsMobileSheet}
          selectPlace={tp.selectPlace}
          selectThing={tp.selectThing}
          removePlace={tp.removePlace}
          removeThing={tp.removeThing}
        />

        {tp.error && <p className="text-sm text-red-400">{tp.error}</p>}

        <div className="flex justify-center md:justify-start">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110 transition"
          >
            Generate itinerary
          </button>
        </div>
      </form>

      {/* Results */}
      {tp.hasSubmitted && !tp.plan && !tp.error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Generate itinerary&quot;.
        </p>
      )}

      {tp.plan && tp.plan.days.length > 0 && (
        <>
          <DraftItinerary
            plan={tp.plan}
            routeStops={tp.routeStops}
            nightsPerStop={tp.nightsPerStop}
            dayStopMeta={tp.dayStopMeta}
            dayDetails={tp.dayDetails}
            openStops={tp.openStops}
            onToggleStopOpen={tp.toggleStopOpen}
            onExpandAllStops={tp.expandAllStops}
            onCollapseAllStops={tp.collapseAllStops}
            addingStopAfterIndex={tp.addingStopAfterIndex}
            newStopCityId={tp.newStopCityId}
            setNewStopCityId={(v) => tp.setNewStopCityId(v)}
            onChangeNights={tp.handleChangeNights}
            onToggleDayOpen={tp.toggleDayOpen}
            onUpdateDayNotes={tp.updateDayNotes}
            onUpdateDayAccommodation={tp.updateDayAccommodation}
            onStartAddStop={tp.handleStartAddStop}
            onConfirmAddStop={tp.handleConfirmAddStop}
            onCancelAddStop={tp.handleCancelAddStop}
            onRemoveStop={tp.handleRemoveStop}
            onReorderStops={tp.handleReorderStops}
          />
        </>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowSaveDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#1E2C4B] border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {initialItinerary ? "Update Itinerary" : "Save Itinerary"}
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {saveSuccess ? (
              <div className="text-center py-4">
                <p className="text-green-400 font-medium">
                  {initialItinerary ? "Itinerary updated successfully!" : "Itinerary saved successfully!"}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  <label className="text-sm font-medium text-white">
                    Title
                  </label>
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveConfirm();
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    placeholder="Enter itinerary title"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSaveDialog(false)}
                    className="flex-1 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConfirm}
                    disabled={tp.saving || !saveTitle.trim()}
                    className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-slate-900 text-sm font-medium hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tp.saving ? (initialItinerary ? "Updating..." : "Saving...") : (initialItinerary ? "Update" : "Save")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <RouteOverview mapPoints={tp.mapPoints} legs={tp.legs} legsLoading={tp.legsLoading} />

      <TripSummary
        routeStops={tp.routeStops}
        nightsPerStop={tp.nightsPerStop}
        totalTripDays={tp.totalTripDays}
        startDate={tp.startDate}
        endDate={tp.endDate}
      />

      {tp.plan && tp.plan.days.length > 0 && (
        <div className="flex flex-col items-center gap-3 pt-4">
          {tp.saveError && (
            <p className="text-sm text-red-400">{tp.saveError}</p>
          )}
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={tp.saving}
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tp.saving ? "Saving..." : initialItinerary ? "Update Itinerary" : "Save Itinerary"}
          </button>
        </div>
      )}
    </div>
  );
}
