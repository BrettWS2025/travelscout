# Production OSM Data Import Guide

This guide explains how to import OSM location data (places and admin areas) into your **production** Supabase database.

## Prerequisites

1. **Python 3.8+** with required packages installed:
   ```bash
   pip install -r scripts/requirements.txt
   ```

2. **Production Supabase credentials** - You'll need:
   - Production Supabase URL
   - Production Service Role Key (required for bypassing RLS)
   - Production Database Password (for SQL execution)

3. **Data files ready**:
   - `out/nz_places.csv` (from `extract_places.py`)
   - `out/nz_admin_areas.geojson` (from `extract_admin_areas.py`)

## Step 1: Update Environment Variables

**Important:** Before running the import, update your `.env.local` file with **production** credentials.

### Required Environment Variables

Add or update these variables in `.env.local`:

```env
# Production Supabase URL
SUPABASE_URL=https://your-prod-project.supabase.co
# OR use NEXT_PUBLIC_ prefix (both work)
NEXT_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co

# Production Service Role Key (REQUIRED - bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key-here

# Production Database Password (for SQL execution)
SUPABASE_DB_PASSWORD=your-production-database-password-here
```

### Where to Find Production Credentials

1. **Supabase URL**: 
   - Go to Supabase Dashboard → Your Production Project → Settings → API
   - Copy the "Project URL"

2. **Service Role Key**:
   - Go to Supabase Dashboard → Your Production Project → Settings → API
   - Copy the `service_role` key (⚠️ **Keep this secret!**)
   - This key bypasses Row Level Security, so it's required for data imports

3. **Database Password**:
   - Go to Supabase Dashboard → Your Production Project → Settings → Database
   - Copy the "Database password"
   - If you don't have it, you can reset it (but this will require updating connection strings)

### Alternative: Use DATABASE_URL

Instead of individual variables, you can set the full connection string:

```env
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

You can find this in: Supabase Dashboard → Settings → Database → Connection string (use "Transaction" mode)

## Step 2: Verify Migrations Are Applied

Ensure all migrations are applied to production:

1. Check that these migrations exist in production:
   - `20240201000000_nz_places_raw.sql`
   - `20240201000001_nz_admin_areas.sql`
   - `20240201000002_nz_places_final.sql`
   - `20240201000003_fix_rebuild_dedupe_conflict.sql`
   - `20240201000004_fix_admin_areas_geometry_type.sql`

2. If migrations haven't been applied:
   - They should deploy automatically via GitHub Actions when pushed to `main` branch
   - Or apply manually via Supabase Dashboard → SQL Editor

## Step 3: Backup Production Data (Recommended)

Before importing, consider backing up existing data:

```sql
-- In Supabase SQL Editor, run:
SELECT COUNT(*) FROM nz_places_raw;
SELECT COUNT(*) FROM nz_admin_areas;
SELECT COUNT(*) FROM nz_places_final;
```

Or export tables if you want a full backup.

## Step 4: Import Places Data

Run the import script (it will use production credentials from `.env.local`):

```bash
cd C:\code\travelscout
python scripts/import_osm_data.py
```

This will:
1. Import `out/nz_places.csv` → `nz_places_raw` table
2. Generate `out/import_admin_areas_generated.sql` for admin areas
3. Attempt to rebuild the final table (may timeout - see Step 6)

**Expected output:**
```
Loaded environment variables from .env.local
Importing places from out/nz_places.csv...
  Imported 1000 places (batch)...
  ...
Places import complete!
```

## Step 5: Import Admin Areas

The script generates SQL but doesn't execute it automatically. Run the admin areas import:

```bash
python scripts/execute_admin_areas_sql.py
```

This will:
- Read `out/import_admin_areas_generated.sql`
- Execute all SQL statements against production database
- Import all admin areas with MultiPolygon geometry support

**Expected output:**
```
Loaded environment variables from .env.local
Reading SQL file: out/import_admin_areas_generated.sql
Found 88 SQL statements
Executing SQL statements...
  Executed 10/88 statements...
  ...
Complete! Executed: 88, Errors: 0
```

## Step 6: Rebuild Final Table

The rebuild function does expensive spatial joins and may timeout via Python. Run it in **Supabase SQL Editor** (no timeout):

1. Go to Supabase Dashboard → SQL Editor
2. Run:
   ```sql
   SELECT * FROM rebuild_nz_places_final('NZ');
   ```

This will:
- Delete existing records for NZ
- Spatially join places to admin areas
- Build enriched table with district/region names
- Handle duplicate dedupe_keys

**Expected result:**
```
inserted_count | updated_count | deleted_count
---------------|---------------|---------------
           6489|              0|              7
```

## Step 7: Verify Import

Run these queries in Supabase SQL Editor to verify:

```sql
-- Check counts
SELECT COUNT(*) as places_raw FROM nz_places_raw;        -- Should be ~6,496
SELECT COUNT(*) as admin_areas FROM nz_admin_areas;       -- Should be 88
SELECT COUNT(*) as places_final FROM nz_places_final;     -- Should be less than places_raw (after deduplication)

-- Sample places with admin area info
SELECT name, place_type, district_name, region_name 
FROM nz_places_final 
ORDER BY name
LIMIT 20;

-- Check for places with district/region info
SELECT 
  COUNT(*) as total,
  COUNT(district_name) as with_district,
  COUNT(region_name) as with_region
FROM nz_places_final;
```

## Step 8: Restore Dev Environment Variables

**Important:** After completing the production import, restore your `.env.local` to **development** credentials to avoid accidentally running scripts against production.

Update `.env.local` back to:
```env
SUPABASE_URL=https://your-dev-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-dev-service-role-key
SUPABASE_DB_PASSWORD=your-dev-database-password
```

## Troubleshooting

### "Error: Supabase credentials must be set"
- Check that `.env.local` has the correct production variables
- Verify variable names match exactly (case-sensitive)
- Restart terminal/command prompt after updating `.env.local`

### "new row violates row-level security policy"
- You're using the anon key instead of service role key
- Update `SUPABASE_SERVICE_ROLE_KEY` with the production service role key

### "Geometry type (Polygon) does not match column type (MultiPolygon)"
- The migration `20240201000004_fix_admin_areas_geometry_type.sql` hasn't been applied
- Apply it via Supabase Dashboard → SQL Editor or wait for GitHub Actions

### "canceling statement due to statement timeout"
- The rebuild function is timing out via Python client
- Run `rebuild_nz_places_final('NZ')` directly in Supabase SQL Editor instead

### "password authentication failed"
- Check that `SUPABASE_DB_PASSWORD` is correct
- Verify the database password in Supabase Dashboard → Settings → Database
- If using `DATABASE_URL`, ensure the connection string format is correct

## Safety Checklist

Before running in production:

- [ ] Verified production Supabase URL is correct
- [ ] Using production service role key (not anon key)
- [ ] All migrations are applied to production
- [ ] Backed up existing data (if any)
- [ ] Tested import process in dev first
- [ ] Have production database password ready
- [ ] Plan to restore dev credentials after import

## Quick Reference: Environment Variables

### For Production Import:
```env
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-prod-service-role-key
SUPABASE_DB_PASSWORD=your-prod-db-password
```

### For Development (restore after):
```env
SUPABASE_URL=https://your-dev-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-dev-service-role-key
SUPABASE_DB_PASSWORD=your-dev-db-password
```

## Notes

- The import scripts use `.env.local` for credentials, so updating it before running is sufficient
- Service role key is required because it bypasses RLS policies
- The rebuild function may take several minutes for large datasets
- Always verify data after import before using in production
- Consider running during low-traffic periods if this affects live data
