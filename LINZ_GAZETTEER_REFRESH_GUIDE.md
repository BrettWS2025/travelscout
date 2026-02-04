# LINZ Gazetteer Refresh Guide

## Overview

When you receive a new LINZ Gazetteer CSV file, follow this guide to refresh your database. This process will:
- Replace the old raw data with new data
- Update all places in the `places` table
- Regenerate search name variants
- Update categories based on feature type mappings

---

## Step-by-Step Process

### Step 1: Import New CSV into `linz_gazetteer_raw`

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to your Supabase project dashboard
2. Navigate to **Table Editor**
3. Find the `linz_gazetteer_raw` table
4. Click the **"..." menu** → **"Import data"** or **"Insert"** → **"Import CSV"**
5. Upload your new `gaz_csv.csv` file
6. Map the columns (they should match automatically)
7. Click **"Import"**

**Option B: Via SQL Editor (Alternative)**

1. Go to **SQL Editor** in Supabase Dashboard
2. First, truncate the existing data:
   ```sql
   TRUNCATE TABLE linz_gazetteer_raw;
   ```
3. Use Supabase's import feature or copy/paste CSV data
   - Note: Direct CSV import via SQL requires proper formatting

**Option C: Via Supabase CLI (If Available)**

```bash
# Link to your project
supabase link --project-ref YOUR_PROJECT_ID --password YOUR_PASSWORD

# Import CSV (if CLI supports it)
# Note: This may require using psql directly
```

---

### Step 2: Verify CSV Import

Run this query to confirm the data was imported:

```sql
-- Check total rows imported
SELECT COUNT(*) as total_rows FROM linz_gazetteer_raw;

-- Check POINT geometries (these are what will be processed)
SELECT COUNT(*) as point_features 
FROM linz_gazetteer_raw 
WHERE geom_type = 'POINT';

-- Sample of imported data
SELECT name_id, name, feat_type, geom_type, crd_latitude, crd_longitude
FROM linz_gazetteer_raw
WHERE geom_type = 'POINT'
LIMIT 10;
```

**Expected results:**
- Total rows should match your CSV row count (minus header)
- POINT features should be a subset of total rows
- Coordinates should be valid numbers

---

### Step 3: Run the Refresh Function

This single function does everything:
1. Populates `places` table from raw data
2. Updates categories based on feature type mappings
3. Regenerates all search name variants
4. Returns statistics

**Run this in SQL Editor:**

```sql
SELECT * FROM refresh_places_from_linz();
```

**What it returns:**
```
total_raw_rows        | Total rows in linz_gazetteer_raw
places_inserted      | New places added
places_updated        | Existing places updated
places_skipped        | Invalid/missing data skipped
categories_updated    | Places with updated categories
names_inserted        | Total name variants created
active_places_count   | Places marked as active
inactive_places_count | Places marked as inactive
new_source_ids_count  | New source IDs added
existing_source_ids_count | Existing source IDs updated
```

---

### Step 4: Verify the Refresh

Run these queries to verify everything worked:

```sql
-- Check total places created
SELECT COUNT(*) as total_places FROM places WHERE is_active = true;

-- Check places by category
SELECT category, COUNT(*) as count 
FROM places 
WHERE is_active = true
GROUP BY category 
ORDER BY count DESC;

-- Check places by region
SELECT region, COUNT(*) as count 
FROM places 
WHERE is_active = true
WHERE region IS NOT NULL
GROUP BY region 
ORDER BY count DESC;

-- Check name variants
SELECT name_type, COUNT(*) as count 
FROM place_names 
GROUP BY name_type;

-- Test search (should find your places)
SELECT * FROM search_places_by_name('Lake Hawea', 5);
```

---

## Complete Refresh Workflow (All Steps)

If you want to do a **complete refresh** (clear everything and start fresh):

```sql
-- 1. Clear existing data
TRUNCATE TABLE linz_gazetteer_raw;
TRUNCATE TABLE place_names;
-- Note: Don't truncate places if you have manually added data you want to keep

-- 2. Import new CSV (via Dashboard or your preferred method)

-- 3. Verify import
SELECT COUNT(*) FROM linz_gazetteer_raw;

-- 4. Run refresh function
SELECT * FROM refresh_places_from_linz();

-- 5. Verify results
SELECT COUNT(*) FROM places WHERE is_active = true;
```

---

## Troubleshooting

### Issue: Refresh function returns 0 inserted places

**Check:**
```sql
-- Are there POINT geometries?
SELECT COUNT(*) FROM linz_gazetteer_raw WHERE geom_type = 'POINT';

-- Do they have valid coordinates?
SELECT COUNT(*) 
FROM linz_gazetteer_raw 
WHERE geom_type = 'POINT'
  AND crd_latitude IS NOT NULL 
  AND crd_longitude IS NOT NULL
  AND crd_latitude != ''
  AND crd_longitude != '';
```

**Solution:** Ensure your CSV has POINT geometries with valid coordinates.

---

### Issue: Places not showing in search

**Check:**
```sql
-- Is the place in the database?
SELECT * FROM places WHERE LOWER(name) LIKE '%your-place%';

-- Is it active?
SELECT * FROM places WHERE LOWER(name) LIKE '%your-place%' AND is_active = true;

-- Does it have name variants?
SELECT pn.*, p.name as place_name
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE LOWER(p.name) LIKE '%your-place%';
```

**Solution:**
- Clear browser cache or wait 5 minutes for cache to expire
- Verify `is_active = true`
- Check that `populate_place_names()` was run

---

### Issue: Categories not mapping correctly

**Check:**
```sql
-- What feature types are in your data?
SELECT feat_type, COUNT(*) 
FROM linz_gazetteer_raw 
WHERE geom_type = 'POINT'
GROUP BY feat_type 
ORDER BY COUNT(*) DESC;

-- What's in your feature_type_map?
SELECT * FROM feature_type_map ORDER BY linz_feat_type;
```

**Solution:** Add missing mappings:
```sql
INSERT INTO feature_type_map (linz_feat_type, internal_category) 
VALUES ('YourFeatType', 'your_category');

-- Then re-run category update
SELECT update_places_categories();
```

---

### Issue: Duplicate places

**Check:**
```sql
-- Find duplicates by name
SELECT name, COUNT(*) as count
FROM places
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Solution:** The `DISTINCT ON (name_id)` in the population function should prevent duplicates. If you see duplicates, they likely have different `source_id` values (different LINZ records for the same place).

---

## Manual Step-by-Step (If You Prefer)

If you want to run each step individually instead of using `refresh_places_from_linz()`:

```sql
-- Step 1: Populate places
SELECT * FROM populate_places_from_linz();

-- Step 2: Update categories
SELECT update_places_categories();

-- Step 3: Generate name variants
SELECT * FROM populate_place_names();
```

---

## Frequency Recommendations

**When to refresh:**
- When LINZ releases a new gazetteer update
- When you notice missing places in your application
- Quarterly or as needed based on your use case

**Best practice:**
- Keep a backup before refreshing (export places table)
- Test in dev environment first
- Refresh during low-traffic periods if possible

---

## Quick Reference

**One command to refresh everything:**
```sql
SELECT * FROM refresh_places_from_linz();
```

**Check if refresh worked:**
```sql
SELECT COUNT(*) FROM places WHERE is_active = true;
```

**Test search:**
```sql
SELECT * FROM search_places_by_name('Your Place Name', 10);
```

---

## Notes

- The refresh function is **idempotent** - safe to run multiple times
- It will **update** existing places if they already exist (based on `source_id`)
- It will **insert** new places if they don't exist
- All POINT places are included regardless of status
- The process typically takes 1-5 minutes depending on data size
