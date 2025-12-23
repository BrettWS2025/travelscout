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

        <WaypointsSection waypoints={tp.waypoints} onChange={tp.setWaypoints} />

        {tp.error && <p className="text-sm text-red-400">{tp.error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110 transition"
        >
          Generate itinerary
        </button>
      </form>

      {/* Results */}
      {tp.hasSubmitted && !tp.plan && !tp.error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Generate itinerary&quot;.
        </p>
      )}

      {tp.plan && tp.plan.days.length > 0 && (
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

      <RouteOverview mapPoints={tp.mapPoints} legs={tp.legs} legsLoading={tp.legsLoading} />

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
