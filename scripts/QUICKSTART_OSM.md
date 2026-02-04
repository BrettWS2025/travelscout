# Quick Start: OSM Data Import

> **For Production Import:** See [PRODUCTION_OSM_IMPORT.md](./PRODUCTION_OSM_IMPORT.md) for detailed instructions on importing to production, including required environment variables and safety checklist.

## Prerequisites

```bash
# Install Python dependencies
pip install -r scripts/requirements.txt
```

## Steps

### 1. Extract Places
```bash
python scripts/extract_places.py
```
Output: `out/nz_places.csv`

### 2. Extract Admin Areas
```bash
python scripts/extract_admin_areas.py
```
Output: `out/nz_admin_areas.geojson`

### 3. Apply Database Migrations

Apply these migrations in Supabase (in order):
- `supabase/migrations/20240201000000_nz_places_raw.sql`
- `supabase/migrations/20240201000001_nz_admin_areas.sql`
- `supabase/migrations/20240201000002_nz_places_final.sql`

### 4. Import Data

**Option A: Using Python (for places)**
```bash
export SUPABASE_URL="your-project-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
python scripts/import_osm_data.py
```

**Option B: Using Supabase Dashboard**
1. Import `out/nz_places.csv` → `nz_places_raw` table
2. For admin areas, use the generated SQL file: `out/import_admin_areas_generated.sql`

**Option C: Using psql**
```bash
# Import places
psql $DATABASE_URL -c "\COPY nz_places_raw(country_code, osm_type, osm_id, place_type, name, name_variants, lat, lon, tags) FROM 'out/nz_places.csv' WITH CSV HEADER;"

# Import admin areas (after Python script generates SQL)
psql $DATABASE_URL -f out/import_admin_areas_generated.sql
```

### 5. Build Final Table

```sql
SELECT * FROM rebuild_nz_places_final('NZ');
```

## Verify

```sql
-- Check counts
SELECT COUNT(*) FROM nz_places_raw;
SELECT COUNT(*) FROM nz_admin_areas;
SELECT COUNT(*) FROM nz_places_final;

-- Sample places
SELECT name, place_type, district_name, region_name 
FROM nz_places_final 
LIMIT 10;
```

## Usage in App

Query `nz_places_final` table directly - no spatial joins needed at runtime!

```sql
SELECT * FROM nz_places_final 
WHERE name_norm LIKE '%auckland%' 
  OR display_name ILIKE '%auckland%';
```
