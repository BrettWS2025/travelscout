# OSM Data Extraction and Import Guide

This guide explains how to extract places and administrative areas from OpenStreetMap (OSM) PBF files and import them into Supabase.

## Prerequisites

1. **Python 3.8+** with pip
2. **OSM PBF file** in `data/new-zealand-260201.osm.pbf`
3. **Supabase project** with PostGIS enabled
4. **Python dependencies** (install with `pip install -r scripts/requirements.txt`)

## Installation

```bash
# Install Python dependencies
pip install -r scripts/requirements.txt
```

Required packages:
- `osmium` - For reading OSM PBF files
- `shapely` - For geometry operations
- `supabase` - For importing data (optional, can use SQL directly)

## Step 1: Extract Places

Extract places (cities, towns, villages, etc.) from the OSM PBF file:

```bash
python scripts/extract_places.py
```

This will:
- Filter: `place=*` AND `name=*`
- Output: `out/nz_places.csv`
- Include: country_code, osm_type, osm_id, place_type, name variants, lat/lon, full tags

## Step 2: Extract Admin Areas

Extract administrative boundaries (regions and districts):

```bash
python scripts/extract_admin_areas.py
```

This will:
- Filter: `boundary=administrative`, `name=*`, `admin_level` in (4, 6)
- Output: `out/nz_admin_areas.geojson`
- Include: country_code, osm_type, osm_id, admin_level, name, polygon geometry

**Note:** This script requires two passes through the PBF file (to collect nodes first, then process relations), so it may take longer.

## Step 3: Run Database Migrations

Apply the Supabase migrations to create the tables:

```bash
# Using Supabase CLI
supabase migration up

# Or apply manually in Supabase SQL editor:
# - 20240201000000_nz_places_raw.sql
# - 20240201000001_nz_admin_areas.sql
# - 20240201000002_nz_places_final.sql
```

This creates three tables:
- `nz_places_raw` - Baseline place points
- `nz_admin_areas` - Reference admin polygons
- `nz_places_final` - Enriched, app-ready table

## Step 4: Import Data

### Option A: Using Python Script (Recommended for places)

```bash
# Set environment variables
export SUPABASE_URL="your-project-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Import data
python scripts/import_osm_data.py
```

This will:
1. Import `out/nz_places.csv` → `nz_places_raw`
2. Generate SQL for admin areas (geometry requires raw SQL)
3. Run `rebuild_nz_places_final()` to build the final table

### Option B: Using SQL Directly

#### Import Places (CSV)

You can use Supabase's table import feature or use `psql`:

```bash
# Using psql
psql $DATABASE_URL -c "\COPY nz_places_raw(country_code, osm_type, osm_id, place_type, name, name_variants, lat, lon, tags) FROM 'out/nz_places.csv' WITH CSV HEADER;"
```

Or use Supabase Dashboard → Table Editor → Import CSV

#### Import Admin Areas (GeoJSON)

The Python script will generate `out/import_admin_areas_generated.sql`. Run it:

```bash
psql $DATABASE_URL -f out/import_admin_areas_generated.sql
```

Or execute the SQL in Supabase SQL editor.

Alternatively, you can use `ogr2ogr` (if you have GDAL installed):

```bash
ogr2ogr -f "PostgreSQL" PG:"$DATABASE_URL" \
  out/nz_admin_areas.geojson \
  -nln nz_admin_areas \
  -nlt PROMOTE_TO_MULTI \
  -lco GEOMETRY_NAME=geometry \
  -lco FID=id \
  -overwrite
```

## Step 5: Build Final Table

After importing raw data, rebuild the final enriched table:

```sql
SELECT * FROM rebuild_nz_places_final('NZ');
```

This function:
- Spatially joins places to admin areas
- Maps `admin_level=6` → district, `admin_level=4` → region
- Generates `name_norm`, `display_name`, `dedupe_key`
- Truncates and rebuilds per country (safe for reruns)

## Usage in Application

Once the data is imported, your application should query only `nz_places_final`:

```sql
-- Search places
SELECT * FROM nz_places_final
WHERE name_norm LIKE '%auckland%'
  OR display_name ILIKE '%auckland%'
ORDER BY place_type, name;

-- Filter by region
SELECT * FROM nz_places_final
WHERE region_name = 'Auckland Region';

-- Spatial query (find places near a point)
SELECT * FROM nz_places_final
WHERE ST_DWithin(
  geometry::geography,
  ST_SetSRID(ST_MakePoint(174.7633, -36.8485), 4326)::geography,
  50000  -- 50km radius
)
ORDER BY ST_Distance(
  geometry::geography,
  ST_SetSRID(ST_MakePoint(174.7633, -36.8485), 4326)::geography
);
```

## Troubleshooting

### osmium not found
```bash
pip install osmium
```

### shapely not found
```bash
pip install shapely
```

### Geometry errors in admin areas
- Some OSM polygons may be invalid. The script tries to fix them with `buffer(0)`
- If issues persist, check the GeoJSON output manually

### Import errors
- Ensure PostGIS is enabled in Supabase
- Check that migrations have been applied
- Verify CSV/GeoJSON files are valid UTF-8

### Performance
- Large PBF files may take time to process
- Admin area extraction requires two passes (slower)
- Spatial joins in `rebuild_nz_places_final()` may take time for large datasets

## Re-running

All scripts and functions are designed to be safe to rerun:
- CSV import uses `ON CONFLICT` (upsert)
- `rebuild_nz_places_final()` truncates before rebuilding
- You can safely re-extract and re-import as OSM data updates
