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
          startResults={tp.startResults}
          endResults={tp.endResults}
          recent={tp.recent}
          suggested={tp.suggested}
          startCityId={tp.startCityId}
          endCityId={tp.endCityId}
          startDate={tp.startDate}
          endDate={tp.endDate}
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

        <WaypointsSection waypoints={tp.waypoints} onChange={tp.setWaypoints} />

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
