"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import WhereWhenPicker from "@/components/trip-planner/WhereWhenPicker";
import DraftItinerary from "@/components/trip-planner/DraftItinerary";
import RouteOverview from "@/components/trip-planner/RouteOverview";
import TripSummary from "@/components/trip-planner/TripSummary";
import LoadingScreen from "@/components/trip-planner/LoadingScreen";
import CitySelectionModal from "@/components/trip-planner/CitySelectionModal";
import PlacesThingsModal from "@/components/trip-planner/PlacesThingsModal";
import AddToItineraryModal from "@/components/trip-planner/AddToItineraryModal";
import { useTripPlanner } from "@/lib/trip-planner/useTripPlanner";
import { useAuth } from "@/components/AuthProvider";
import type { TripInput } from "@/lib/itinerary";
import type { WalkingExperience } from "@/lib/walkingExperiences";

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

function TripPlannerContent({ initialItinerary }: TripPlannerProps = {}) {
  const tp = useTripPlanner();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [itineraryLoaded, setItineraryLoaded] = useState(false);
  const [stateRestored, setStateRestored] = useState(false);
  
  // City selection modal state
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityModalStep, setCityModalStep] = useState<"start" | "end" | "dates" | "return">("start");

  // Places/Things modal state
  const [showPlacesThingsModal, setShowPlacesThingsModal] = useState(false);
  const [placesThingsModalStep, setPlacesThingsModalStep] = useState<"places" | "things">("places");

  // Add to itinerary modal state
  const [showAddToItineraryModal, setShowAddToItineraryModal] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<WalkingExperience | null>(null);
  const [selectedExperienceLocation, setSelectedExperienceLocation] = useState<string>("");

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

  // Handle URL search params for deep linking (only sync URL -> state, not state -> URL)
  useEffect(() => {
    const setupParam = searchParams.get("setup");
    if (setupParam === "start" || setupParam === "end" || setupParam === "dates") {
      // Only open if not already open with the same step
      if (!showCityModal || cityModalStep !== setupParam) {
        setCityModalStep(setupParam as "start" | "end" | "dates");
        setShowCityModal(true);
      }
    } else if (setupParam === null && showCityModal) {
      // URL param was removed, close the modal
      setShowCityModal(false);
    }
  }, [searchParams]);

  // Update URL when modal state changes
  const handleOpenCityModal = (step: "start" | "end" | "dates" | "return") => {
    setCityModalStep(step);
    setShowCityModal(true);
    if (step !== "return") {
      router.push(`/trip-planner?setup=${step}`, { scroll: false });
    }
  };

  const handleOpenReturnQuestion = () => {
    setCityModalStep("return");
    setShowCityModal(true);
  };

  const handleCloseCityModal = () => {
    // Close modal immediately
    setShowCityModal(false);
    // Remove setup param from URL (use replace to avoid adding to history)
    const params = new URLSearchParams(searchParams.toString());
    params.delete("setup");
    const newUrl = params.toString() 
      ? `/trip-planner?${params.toString()}` 
      : "/trip-planner";
    router.replace(newUrl, { scroll: false });
  };

  const handleCityModalStepChange = (step: "start" | "end" | "dates") => {
    setCityModalStep(step);
    const params = new URLSearchParams(searchParams.toString());
    params.set("setup", step);
    router.push(`/trip-planner?${params.toString()}`, { scroll: false });
  };

  const handleSelectDates = () => {
    // This is called when "Select dates" button is clicked in the modal
    // The modal will handle the step change internally
  };

  const handleOpenPlacesThingsModal = (step: "places" | "things") => {
    setPlacesThingsModalStep(step);
    setShowPlacesThingsModal(true);
  };

  const handleClosePlacesThingsModal = () => {
    setShowPlacesThingsModal(false);
  };

  const handlePlacesThingsModalStepChange = (step: "places" | "things") => {
    setPlacesThingsModalStep(step);
  };

  // Handle adding experience to itinerary
  const handleAddToItinerary = (experience: WalkingExperience, location: string) => {
    setSelectedExperience(experience);
    setSelectedExperienceLocation(location);
    setShowAddToItineraryModal(true);
  };

  const handleCloseAddToItineraryModal = () => {
    setShowAddToItineraryModal(false);
    setSelectedExperience(null);
    setSelectedExperienceLocation("");
  };

  // Add experience to day
  const handleAddToDay = (date: string, location: string, experience: WalkingExperience) => {
    tp.addExperienceToDay(date, location, experience);
  };

  // Add experience to road sector
  const handleAddToRoadSector = (destinationStopIndex: number, experience: WalkingExperience) => {
    tp.addExperienceToRoadSector(destinationStopIndex, experience);
  };

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
      <LoadingScreen isLoading={tp.legsLoading} />
      <form
        onSubmit={tp.handleSubmit}
        className="p-4 md:p-6 space-y-6"
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
          startQuery={tp.startQuery}
          endQuery={tp.endQuery}
          destinationsQuery={tp.destinationsQuery}
          destinationsResults={tp.destinationsResults}
          recent={tp.recent}
          suggested={tp.suggested}
          startResults={tp.startResults}
          endResults={tp.endResults}
          startCityId={tp.startCityId}
          endCityId={tp.endCityId}
          destinationIds={tp.destinationIds}
          dateRange={tp.dateRange}
          calendarMonth={tp.calendarMonth}
          startSummary={tp.whereSummary}
          destinationsSummary={tp.destinationsSummary}
          whenLabel={tp.whenLabel}
          setMobileActive={tp.setMobileActive}
          setShowCalendar={tp.setShowCalendar}
          setActivePill={tp.setActivePill}
          setStartQuery={tp.setStartQuery}
          setEndQuery={tp.setEndQuery}
          setDestinationsQuery={tp.setDestinationsQuery}
          openMobileSheet={tp.openMobileSheet}
          closeMobileSheet={tp.closeMobileSheet}
          openWhereDesktop={tp.openWhereDesktop}
          openWhenDesktop={tp.openWhenDesktop}
          selectStartCity={tp.selectStartCity}
          selectEndCity={tp.selectEndCity}
          selectReturnToStart={tp.selectReturnToStart}
          selectDestination={tp.selectDestination}
          removeDestination={tp.removeDestination}
          clearEndCity={tp.clearEndCity}
          handleDateRangeChange={tp.handleDateRangeChange}
          setDateRange={tp.setDateRange}
          setCalendarMonth={tp.setCalendarMonth}
          clearDates={() => {
            tp.setDateRange(undefined);
            tp.setStartDate("");
            tp.setEndDate("");
            tp.setCalendarMonth(new Date());
          }}
          onOpenCityModal={handleOpenCityModal}
          onOpenReturnQuestion={handleOpenReturnQuestion}
        />


        {tp.error && <p className="text-sm text-red-400">{tp.error}</p>}

        <div className="flex justify-center md:justify-start">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white hover:brightness-110 transition shadow-lg hover:shadow-xl"
            style={{ 
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
          >
            Create itinerary
          </button>
        </div>
      </form>

      {/* Results */}
      {tp.hasSubmitted && !tp.plan && !tp.error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Create itinerary&quot;.
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
            roadSectorDetails={tp.roadSectorDetails}
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
            onRemoveExperienceFromDay={tp.removeExperienceFromDay}
            onToggleRoadSectorOpen={tp.toggleRoadSectorOpen}
            onUpdateRoadSectorActivities={tp.updateRoadSectorActivities}
            onRemoveExperienceFromRoadSector={tp.removeExperienceFromRoadSector}
            startSectorType={tp.startSectorType}
            endSectorType={tp.endSectorType}
            onConvertStartToItinerary={tp.convertStartToItinerary}
            onConvertStartToRoad={tp.convertStartToRoad}
            onConvertEndToItinerary={tp.convertEndToItinerary}
            onConvertEndToRoad={tp.convertEndToRoad}
            onStartAddStop={tp.handleStartAddStop}
            onConfirmAddStop={tp.handleConfirmAddStop}
            onCancelAddStop={tp.handleCancelAddStop}
            onRemoveStop={tp.handleRemoveStop}
            onReorderStops={tp.handleReorderStops}
            onAddToItinerary={handleAddToItinerary}
          />
        </>
      )}

      {/* Add to Itinerary Modal */}
      {showAddToItineraryModal && selectedExperience && tp.plan && (
        <AddToItineraryModal
          isOpen={showAddToItineraryModal}
          onClose={handleCloseAddToItineraryModal}
          experience={selectedExperience}
          location={selectedExperienceLocation}
          plan={tp.plan}
          routeStops={tp.routeStops}
          nightsPerStop={tp.nightsPerStop}
          dayStopMeta={tp.dayStopMeta}
          dayDetails={tp.dayDetails}
          roadSectorDetails={tp.roadSectorDetails}
          startSectorType={tp.startSectorType}
          endSectorType={tp.endSectorType}
          onAddToDay={handleAddToDay}
          onAddToRoadSector={handleAddToRoadSector}
        />
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
                    className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                    style={{ 
                      background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                    }}
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
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            style={{ 
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
          >
            {tp.saving ? "Saving..." : initialItinerary ? "Update Itinerary" : "Save Itinerary"}
          </button>
        </div>
      )}

      {/* City Selection Modal */}
      <CitySelectionModal
        isOpen={showCityModal}
        onClose={handleCloseCityModal}
        step={cityModalStep}
        onStepChange={handleCityModalStepChange}
        startCityId={tp.startCityId}
        endCityId={tp.endCityId}
        onSelectStartCity={tp.selectStartCity}
        onSelectEndCity={tp.selectEndCity}
        onSelectReturnToStart={tp.selectReturnToStart}
        onClearEndCity={tp.clearEndCity}
        onSelectDates={handleSelectDates}
        dateRange={tp.dateRange}
        calendarMonth={tp.calendarMonth}
        onDateRangeChange={tp.handleDateRangeChange}
        onCalendarMonthChange={tp.setCalendarMonth}
        onClearDates={() => {
          tp.setDateRange(undefined);
          tp.setStartDate("");
          tp.setEndDate("");
          tp.setCalendarMonth(new Date());
        }}
        recent={tp.recent}
        suggested={tp.suggested}
      />

      {/* Places/Things Selection Modal */}
      <PlacesThingsModal
        isOpen={showPlacesThingsModal}
        onClose={handleClosePlacesThingsModal}
        step={placesThingsModalStep}
        onStepChange={handlePlacesThingsModalStepChange}
        placesQuery={tp.placesQuery}
        thingsQuery={tp.thingsQuery}
        setPlacesQuery={tp.setPlacesQuery}
        setThingsQuery={tp.setThingsQuery}
        placesResults={tp.placesResults}
        thingsResults={tp.thingsResults}
        recent={tp.recent}
        suggested={tp.suggested}
        selectedPlaceIds={tp.selectedPlaceIds}
        selectedPlaces={tp.selectedPlaces}
        selectedThingIds={tp.selectedThingIds}
        onSelectPlace={tp.selectPlace}
        onSelectThing={tp.selectThing}
        onRemovePlace={tp.removePlace}
        onRemoveThing={tp.removeThing}
      />
    </div>
  );
}

export default function TripPlanner({ initialItinerary }: TripPlannerProps = {}) {
  return (
    <Suspense fallback={<div className="text-white/70">Loading...</div>}>
      <TripPlannerContent initialItinerary={initialItinerary} />
    </Suspense>
  );
}
