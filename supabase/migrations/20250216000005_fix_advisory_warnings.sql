-- ============================================================================
-- FIX SUPABASE ADVISORY WARNINGS
-- ============================================================================
-- This migration fixes WARN-level security and performance issues:
-- 
-- Security Issues:
-- 1. Fix function search_path for 3 functions to prevent security vulnerabilities
-- 2. Note: Leaked password protection is an Auth setting (not a code fix)
-- 
-- Performance Issues:
-- 1. Fix RLS policies to prevent per-row re-evaluation of auth functions
--    Change: auth.role() -> (select auth.role())
-- ============================================================================

-- ============================================================================
-- FIX FUNCTION SEARCH_PATH (Security)
-- ============================================================================
-- Set search_path to empty string to prevent search_path injection attacks

-- Fix update_cached_viator_products_updated_at function
CREATE OR REPLACE FUNCTION update_cached_viator_products_updated_at()
RETURNS TRIGGER 
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix update_cached_events_updated_at function
CREATE OR REPLACE FUNCTION update_cached_events_updated_at()
RETURNS TRIGGER 
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix upsert_viator_tags function
CREATE OR REPLACE FUNCTION upsert_viator_tags(
  p_tag_id INTEGER,
  p_tag_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_group_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void 
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.viator_tags (
    tag_id,
    tag_name,
    description,
    category,
    group_name,
    metadata,
    last_synced_at
  )
  VALUES (
    p_tag_id,
    p_tag_name,
    p_description,
    p_category,
    p_group_name,
    p_metadata,
    NOW()
  )
  ON CONFLICT (tag_id) DO UPDATE SET
    tag_name = EXCLUDED.tag_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    group_name = EXCLUDED.group_name,
    metadata = EXCLUDED.metadata,
    last_synced_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX RLS PERFORMANCE ISSUES (Performance)
-- ============================================================================
-- Wrap auth.role() in (select auth.role()) to prevent per-row re-evaluation

-- Fix cached_events RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to insert cached events" ON public.cached_events;
CREATE POLICY "Allow authenticated users to insert cached events"
  ON public.cached_events
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to update cached events" ON public.cached_events;
CREATE POLICY "Allow authenticated users to update cached events"
  ON public.cached_events
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated');

-- Fix cached_viator_products RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to insert cached viator products" ON public.cached_viator_products;
CREATE POLICY "Allow authenticated users to insert cached viator products"
  ON public.cached_viator_products
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to update cached viator products" ON public.cached_viator_products;
CREATE POLICY "Allow authenticated users to update cached viator products"
  ON public.cached_viator_products
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated');
