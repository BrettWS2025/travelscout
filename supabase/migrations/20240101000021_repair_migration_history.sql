-- ============================================================================
-- Repair migration history
-- ============================================================================
-- Purpose: Remove migration entries for deleted migration files
-- This repairs the migration history after consolidating multiple fix migrations
-- into a single migration (20240101000017)

-- Remove the migration entries for the deleted fix migrations
-- These were consolidated into 20240101000017_include_polygon_geometries.sql
DELETE FROM supabase_migrations.schema_migrations 
WHERE version IN ('20240101000018', '20240101000019', '20240101000020');
