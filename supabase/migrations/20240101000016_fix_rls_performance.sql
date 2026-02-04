-- ============================================================================
-- FIX RLS PERFORMANCE ISSUES
-- ============================================================================
-- This migration fixes WARN-level performance issues by optimizing RLS policies
-- to prevent per-row re-evaluation of auth functions.
-- 
-- Change: auth.uid() -> (select auth.uid())
-- Change: auth.role() -> (select auth.role())
-- 
-- This ensures the auth function is called once per query, not once per row.
-- ============================================================================

-- ============================================================================
-- FIX PROFILES TABLE POLICIES (3 policies)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

-- ============================================================================
-- FIX TRIPS TABLE POLICIES (4 policies)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own trips" ON trips;
CREATE POLICY "Users can view own trips"
  ON trips FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own trips" ON trips;
CREATE POLICY "Users can create own trips"
  ON trips FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own trips" ON trips;
CREATE POLICY "Users can update own trips"
  ON trips FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own trips" ON trips;
CREATE POLICY "Users can delete own trips"
  ON trips FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- FIX TRIP_DAYS TABLE POLICIES (4 policies)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view trip days for own trips" ON trip_days;
CREATE POLICY "Users can view trip days for own trips"
  ON trip_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create trip days for own trips" ON trip_days;
CREATE POLICY "Users can create trip days for own trips"
  ON trip_days FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update trip days for own trips" ON trip_days;
CREATE POLICY "Users can update trip days for own trips"
  ON trip_days FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete trip days for own trips" ON trip_days;
CREATE POLICY "Users can delete trip days for own trips"
  ON trip_days FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- FIX ACTIVITIES TABLE POLICIES (4 policies)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view activities for own trips" ON activities;
CREATE POLICY "Users can view activities for own trips"
  ON activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create activities for own trips" ON activities;
CREATE POLICY "Users can create activities for own trips"
  ON activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update activities for own trips" ON activities;
CREATE POLICY "Users can update activities for own trips"
  ON activities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete activities for own trips" ON activities;
CREATE POLICY "Users can delete activities for own trips"
  ON activities FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- FIX PACKAGES TABLE POLICIES (1 policy)
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view packages" ON packages;
CREATE POLICY "Authenticated users can view packages"
  ON packages FOR SELECT
  USING ((select auth.role()) = 'authenticated');

-- ============================================================================
-- FIX ITINERARIES TABLE POLICIES (4 policies)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own itineraries" ON itineraries;
CREATE POLICY "Users can view own itineraries"
  ON itineraries FOR SELECT
  USING ((select auth.uid()) = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can create own itineraries" ON itineraries;
CREATE POLICY "Users can create own itineraries"
  ON itineraries FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own itineraries" ON itineraries;
CREATE POLICY "Users can update own itineraries"
  ON itineraries FOR UPDATE
  USING ((select auth.uid()) = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete own itineraries" ON itineraries;
CREATE POLICY "Users can delete own itineraries"
  ON itineraries FOR DELETE
  USING ((select auth.uid()) = user_id OR user_id IS NULL);

-- ============================================================================
-- FIX TRAVEL_SCOUT_RECORDS TABLE POLICIES (1 policy)
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view travel scout records" ON travel_scout_records;
CREATE POLICY "Authenticated users can view travel scout records"
  ON travel_scout_records FOR SELECT
  USING ((select auth.role()) = 'authenticated');
