"use client";

import WhereWhenPicker from "@/components/trip-planner/WhereWhenPicker";
import WaypointsSection from "@/components/trip-planner/WaypointsSection";
import DraftItinerary from "@/components/trip-planner/DraftItinerary";
import RouteOverview from "@/components/trip-planner/RouteOverview";
import TripSummary from "@/components/trip-planner/TripSummary";
import { useTripPlanner } from "@/lib/trip-planner/useTripPlanner";

export default function TripPlanner() {
  const tp = useTripPlanner();

  return (
    <div className="space-y-8">
      <form onSubmit={tp.handleSubmit} className="card p-4 md:p-6 space-y-6">
        <WhereWhenPicker
          startCityId={tp.startCityId}
          endCityId={tp.endCityId}
          returnToStart={tp.returnToStart}
          startQuery={tp.startQuery}
          endQuery={tp.endQuery}
          startDate={tp.startDate}
          endDate={tp.endDate}
          selectedRange={tp.selectedRange}
          isLoading={tp.isLoading}
          errorMsg={tp.errorMsg}
          startResults={tp.startResults}
          endResults={tp.endResults}
          activePill={tp.activePill}
          showWherePopover={tp.showWherePopover}
          showCalendar={tp.showCalendar}
          mobileSheetOpen={tp.mobileSheetOpen}
          whereRef={tp.whereRef}
          whenRef={tp.whenRef}
          setStartQuery={tp.setStartQuery}
          setEndQuery={tp.setEndQuery}
          setStartDate={tp.setStartDate}
          setEndDate={tp.setEndDate}
          onOpenWhere={tp.openWhereDesktop}
          onOpenWhen={tp.openWhenDesktop}
          onOpenMobileSheet={tp.openMobileSheet}
          onCloseMobileSheet={tp.closeMobileSheet}
          onSelectStart={tp.selectStartCity}
          onSelectEnd={tp.selectEndCity}
          onToggleReturnToStart={tp.selectReturnToStart}
          onRangeChange={tp.handleDateRangeChange}
        />

        <WaypointsSection
          waypoints={tp.waypoints}
          setWaypoints={tp.setWaypoints}
          suggestedWaypoints={tp.suggestedWaypoints}
          isLoading={tp.isLoading}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-accent px-6 py-3"
            disabled={tp.isLoading}
          >
            {tp.isLoading ? "Generating..." : "Generate itinerary"}
          </button>
        </div>
      </form>

      {tp.hasSubmitted && tp.plan.days.length > 0 && (
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
      )}

      <RouteOverview
        mapPoints={tp.mapPoints}
        legs={tp.legs}
        legsLoading={tp.legsLoading}
      />

      <TripSummary
        routeStops={tp.routeStops}
        nightsPerStop={tp.nightsPerStop}
        totalTripDays={tp.totalTripDays}
        startDate={tp.startDate}
        endDate={tp.endDate}
      />
    </div>
  );
}
