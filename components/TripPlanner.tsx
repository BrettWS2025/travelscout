"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, Edit3 } from "lucide-react";
import WhereWhenPicker from "@/components/trip-planner/WhereWhenPicker";
import DraftItinerary from "@/components/trip-planner/DraftItinerary";
import LoadingScreen from "@/components/trip-planner/LoadingScreen";
import CitySelectionModal from "@/components/trip-planner/CitySelectionModal";
import PlacesThingsModal from "@/components/trip-planner/PlacesThingsModal";
import AddToItineraryModal from "@/components/trip-planner/AddToItineraryModal";
import { useTripPlanner } from "@/lib/trip-planner/useTripPlanner";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";
import type { TripInput, TripPlan } from "@/lib/itinerary";
import type { WalkingExperience } from "@/lib/walkingExperiences";
import type { ExperienceItem } from "@/lib/viator-helpers";
import { transformExperienceItemToWalking } from "@/lib/viator-helpers";
import type { Event } from "@/lib/hooks/useEvents";

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

const TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY = "tripPlanner_restore_after_auth";

function TripPlannerContent({ initialItinerary }: TripPlannerProps = {}) {
  const tp = useTripPlanner();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [itineraryLoaded, setItineraryLoaded] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [authModalContext, setAuthModalContext] = useState<"add-to-itinerary" | "pin-event" | "save-itinerary">("save-itinerary");
  const [isFormMinimized, setIsFormMinimized] = useState(false);
  const prevPlanRef = useRef<TripPlan | null>(null);
  
  // Pending actions (to execute after authentication)
  const [pendingAddToItinerary, setPendingAddToItinerary] = useState<{
    experience: WalkingExperience | ExperienceItem;
    location: string;
    dayDate?: string;
    dayLocation?: string;
  } | null>(null);
  const [pendingPinEvent, setPendingPinEvent] = useState<{
    event: Event;
    date: string;
    location: string;
  } | null>(null);
  
  // City selection modal state
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityModalStep, setCityModalStep] = useState<"start" | "end" | "destinations" | "dates" | "return">("start");

  // Places/Things modal state
  const [showPlacesThingsModal, setShowPlacesThingsModal] = useState(false);
  const [placesThingsModalStep, setPlacesThingsModalStep] = useState<"places" | "things">("places");

  // Add to itinerary modal state
  const [showAddToItineraryModal, setShowAddToItineraryModal] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<WalkingExperience | null>(null);
  const [selectedViatorProduct, setSelectedViatorProduct] = useState<ExperienceItem | null>(null);
  const [selectedExperienceLocation, setSelectedExperienceLocation] = useState<string>("");
  const handledInitialDraftBehaviorRef = useRef(false);
  const [isRestoringDraft, setIsRestoringDraft] = useState(!initialItinerary);

  // Restore any saved draft so Journey/Summary navigation keeps the same state.
  // (Saved itineraries opened via /trip-planner/[id] use `initialItinerary` instead.)
  useEffect(() => {
    if (handledInitialDraftBehaviorRef.current) return;
    handledInitialDraftBehaviorRef.current = true;
    if (initialItinerary) {
      setIsRestoringDraft(false);
      return;
    }
    try {
      tp.restoreStateFromLocalStorage();
      localStorage.removeItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY);
    } catch (err) {
      console.error("Failed to process trip planner draft state:", err);
    } finally {
      setIsRestoringDraft(false);
    }
  }, [initialItinerary, tp]);

  // Keep local draft synced as users edit itinerary data so route switches preserve progress.
  useEffect(() => {
    if (initialItinerary) return;
    tp.saveStateToLocalStorage();
  }, [
    initialItinerary,
    tp,
    tp.startCityId,
    tp.endCityId,
    tp.startDate,
    tp.endDate,
    tp.selectedPlaceIds,
    tp.selectedThingIds,
    tp.routeStops,
    tp.nightsPerStop,
    tp.startSectorType,
    tp.endSectorType,
    tp.hasSubmitted,
    tp.plan,
    tp.dayDetails,
    tp.mapPoints,
    tp.legs,
  ]);

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

  // Auto-minimize form whenever a new plan is generated after submission
  useEffect(() => {
    // Check if this is a new plan (different from the previous one)
    const isNewPlan = tp.plan !== null && tp.plan !== prevPlanRef.current;
    
    // Minimize when a new plan is generated after submission
    if (isNewPlan && tp.hasSubmitted) {
      setIsFormMinimized(true);
      // Save state to localStorage so navbar can detect it
      tp.saveStateToLocalStorage();
      // Dispatch custom event to notify navbar that plan was created
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tripPlanCreated"));
      }
    }
    
    // Update the previous plan reference
    prevPlanRef.current = tp.plan;
  }, [tp.plan, tp.hasSubmitted, tp]);

  // Listen for expand form event from navbar
  useEffect(() => {
    const handleExpandForm = () => {
      setIsFormMinimized(false);
    };
    window.addEventListener("expandTripPlannerForm", handleExpandForm);
    return () => {
      window.removeEventListener("expandTripPlannerForm", handleExpandForm);
    };
  }, []);

  // After auth modal closes, wait for user to be available, then show title dialog
  useEffect(() => {
    if (pendingSave && !showAuthModal && user) {
      // User has logged in, show title dialog
      const defaultTitle = initialItinerary?.title || (tp.startCity && tp.endCity
        ? `Trip from ${tp.startCity.name} to ${tp.endCity.name}`
        : "My Trip");
      setSaveTitle(defaultTitle);
      setShowSaveDialog(true);
      setSaveSuccess(false);
      setPendingSave(false);
    }
  }, [pendingSave, showAuthModal, user, initialItinerary, tp]);

  // Execute pending actions after successful authentication
  useEffect(() => {
    // Only execute if auth modal just closed and user is now authenticated
    // and we have pending actions
    if (!showAuthModal && user && (pendingAddToItinerary || pendingPinEvent)) {
      // User just authenticated, execute pending actions
      if (pendingAddToItinerary) {
        const action = pendingAddToItinerary;
        setPendingAddToItinerary(null); // Clear immediately to prevent re-execution
        proceedWithAddToItinerary(
          action.experience,
          action.location,
          action.dayDate,
          action.dayLocation
        );
      }
      
      if (pendingPinEvent) {
        // Save event to cache first, then pin it
        const action = pendingPinEvent;
        setPendingPinEvent(null); // Clear immediately to prevent re-execution
        const saveEvent = async () => {
          const { saveEventToCache } = await import("@/lib/events.api");
          const result = await saveEventToCache(action.event);
          if (result.success) {
            // Event saved to cache, now pin it to the day
            tp.addEventToDay(
              action.date,
              action.location,
              action.event
            );
          } else {
            console.error("Failed to save event to cache:", result.error);
          }
        };
        saveEvent();
      }
    }
  }, [showAuthModal, user, pendingAddToItinerary, pendingPinEvent, tp]);

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
  const handleOpenCityModal = (step: "start" | "end" | "destinations" | "dates" | "return") => {
    setCityModalStep(step);
    setShowCityModal(true);
    if (step !== "return" && step !== "destinations") {
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

  const handleCityModalStepChange = (step: "start" | "end" | "destinations" | "dates" | "return") => {
    setCityModalStep(step);
    if (step !== "return" && step !== "destinations") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("setup", step);
      router.push(`/trip-planner?${params.toString()}`, { scroll: false });
    }
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
  const handleAddToItinerary = async (
    experience: WalkingExperience | ExperienceItem,
    location: string,
    dayDate?: string,
    dayLocation?: string
  ) => {
    // Check if user is authenticated
    if (!user) {
      tp.saveStateToLocalStorage();
      localStorage.setItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY, "1");
      // Store the pending action and show auth modal
      setPendingAddToItinerary({ experience, location, dayDate, dayLocation });
      setAuthModalContext("add-to-itinerary");
      setShowAuthModal(true);
      return;
    }

    // User is authenticated, proceed with adding to itinerary
    await proceedWithAddToItinerary(experience, location, dayDate, dayLocation);
  };

  // Internal function to actually add to itinerary (called after auth or if already authenticated)
  const proceedWithAddToItinerary = async (
    experience: WalkingExperience | ExperienceItem,
    location: string,
    dayDate?: string,
    dayLocation?: string
  ) => {
    // If a specific day is provided (timeline view), add directly to that day
    if (dayDate && dayLocation) {
      if ("type" in experience && experience.type === "viator") {
        const { saveViatorProductToCache } = await import("@/lib/viator.api");
        const result = await saveViatorProductToCache(experience);

        if (!result.success) {
          console.error("Failed to save Viator product to cache:", result.error);
          return;
        }

        tp.addViatorProductToDay(dayDate, dayLocation, experience);
        return;
      }

      // Handle walking experiences (ExperienceItem or WalkingExperience)
      let walkingExp: WalkingExperience;
      if ("type" in experience && experience.type === "walking") {
        const converted = transformExperienceItemToWalking(experience);
        if (!converted) {
          console.error("Failed to convert ExperienceItem to WalkingExperience");
          return;
        }
        walkingExp = converted;
      } else {
        walkingExp = experience as WalkingExperience;
      }

      tp.addExperienceToDay(dayDate, dayLocation, walkingExp);
      return;
    }

    // No specific day: open modal so user can choose where to add
    if ("type" in experience && experience.type === "viator") {
      const { saveViatorProductToCache } = await import("@/lib/viator.api");
      const result = await saveViatorProductToCache(experience);

      if (!result.success) {
        console.error("Failed to save Viator product to cache:", result.error);
        return;
      }

      setSelectedViatorProduct(experience);
      setSelectedExperience(null);
      setSelectedExperienceLocation(location);
      setShowAddToItineraryModal(true);
      return;
    }

    let walkingExp: WalkingExperience;
    if ("type" in experience && experience.type === "walking") {
      const converted = transformExperienceItemToWalking(experience);
      if (!converted) {
        console.error("Failed to convert ExperienceItem to WalkingExperience");
        return;
      }
      walkingExp = converted;
    } else {
      walkingExp = experience as WalkingExperience;
    }

    setSelectedExperience(walkingExp);
    setSelectedViatorProduct(null);
    setSelectedExperienceLocation(location);
    setShowAddToItineraryModal(true);
  };

  const handleCloseAddToItineraryModal = () => {
    setShowAddToItineraryModal(false);
    setSelectedExperience(null);
    setSelectedViatorProduct(null);
    setSelectedExperienceLocation("");
  };

  // Add experience to day
  const handleAddToDay = (date: string, location: string, experience: WalkingExperience) => {
    tp.addExperienceToDay(date, location, experience);
  };

  // Add Viator product to day
  const handleAddViatorProductToDay = (date: string, location: string, product: ExperienceItem) => {
    tp.addViatorProductToDay(date, location, product);
  };

  // Add experience to road sector
  const handleAddToRoadSector = (destinationStopIndex: number, experience: WalkingExperience) => {
    tp.addExperienceToRoadSector(destinationStopIndex, experience);
  };

  // Handle event hearted (pins directly to the day it's shown for)
  const handleEventHearted = (event: Event, date: string, location: string) => {
    // Check if user is authenticated
    if (!user) {
      tp.saveStateToLocalStorage();
      localStorage.setItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY, "1");
      // Store the pending action and show auth modal
      setPendingPinEvent({ event, date, location });
      setAuthModalContext("pin-event");
      setShowAuthModal(true);
      return;
    }

    // User is authenticated, proceed with pinning event
    tp.addEventToDay(date, location, event);
  };

  // Handle require auth for events (called from EventsAttractionsCarousel)
  const handleRequireAuth = (event: Event, date: string, location: string) => {
    tp.saveStateToLocalStorage();
    localStorage.setItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY, "1");
    // Store the pending action and show auth modal
    setPendingPinEvent({ event, date, location });
    setAuthModalContext("pin-event");
    setShowAuthModal(true);
  };

  // Remove event from day
  const handleRemoveEventFromDay = (date: string, location: string, eventId: number) => {
    tp.removeEventFromDay(date, location, eventId);
  };

  // Remove Viator product from day
  const handleRemoveViatorProductFromDay = (date: string, location: string, productId: string) => {
    tp.removeViatorProductFromDay(date, location, productId);
  };

  const handleSaveClick = () => {
    if (!user) {
      // Save current state to localStorage before showing auth modal
      tp.saveStateToLocalStorage();
      localStorage.setItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY, "1");
      setPendingSave(true);
      setAuthModalContext("save-itinerary");
      setShowAuthModal(true);
      return;
    }
    // User is logged in, show title dialog immediately
    showTitleDialog();
  };

  const showTitleDialog = () => {
    // Use existing title if editing, otherwise generate default
    const defaultTitle = initialItinerary?.title || (tp.startCity && tp.endCity
      ? `Trip from ${tp.startCity.name} to ${tp.endCity.name}`
      : "My Trip");
    setSaveTitle(defaultTitle);
    setShowSaveDialog(true);
    setSaveSuccess(false);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // The useEffect will handle showing the title dialog once user is available
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
      // Navigate to itineraries list after a brief delay
      setTimeout(() => {
        setShowSaveDialog(false);
        setSaveSuccess(false);
        setSaveTitle("");
        setPendingSave(false);
        router.push("/account/itineraries");
      }, 1000);
    }
  };

  return (
    <div className="space-y-8">
      <LoadingScreen isLoading={tp.legsLoading || isRestoringDraft} />
      

      {/* Full form - shown when not minimized or when no plan exists */}
      {!isRestoringDraft && (!isFormMinimized || !tp.plan) && (
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

          <div className="flex justify-center">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white hover:brightness-110 transition shadow-lg hover:shadow-xl"
              style={{ 
                background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              }}
            >
              Create your journey
            </button>
          </div>
        </form>
      )}

      {/* Results */}
      {!isRestoringDraft && tp.hasSubmitted && !tp.plan && !tp.error && (
        <p className="text-sm text-gray-400 text-center md:text-left">
          Fill in your trip details and click &quot;Create your journey&quot;.
        </p>
      )}

      {!isRestoringDraft && tp.plan && tp.plan.days.length > 0 && (
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
            onRemoveEventFromDay={handleRemoveEventFromDay}
            onRemoveViatorProductFromDay={handleRemoveViatorProductFromDay}
            onEventHearted={handleEventHearted}
            onRequireAuth={handleRequireAuth}
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
            endDate={tp.endDate}
            legs={tp.legs}
          />
        </>
      )}

      {/* Add to Itinerary Modal */}
      {!isRestoringDraft && showAddToItineraryModal && (selectedExperience || selectedViatorProduct) && tp.plan && (
        <AddToItineraryModal
          isOpen={showAddToItineraryModal}
          onClose={handleCloseAddToItineraryModal}
          experience={selectedExperience || undefined}
          viatorProduct={selectedViatorProduct || undefined}
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
          onAddViatorProductToDay={handleAddViatorProductToDay}
          onAddToRoadSector={handleAddToRoadSector}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => {
            setShowAuthModal(false);
            setPendingSave(false);
            localStorage.removeItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY);
            // Clear pending actions if user closes modal without authenticating
            setPendingAddToItinerary(null);
            setPendingPinEvent(null);
          }}
          onSuccess={handleAuthSuccess}
          context={authModalContext}
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

      {!isRestoringDraft && tp.plan && tp.plan.days.length > 0 && (
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
