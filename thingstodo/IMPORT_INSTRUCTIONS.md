# DOC Walking Experiences Import Instructions

This guide explains how to import the CSV files into Supabase and transform them into the processed table.

## Step 1: Apply Migrations

Apply the three migration files in order:

1. `20250215000001_create_doc_walking_tables.sql` - Creates the two raw tables
2. `20250215000002_create_walking_experiences_processed.sql` - Creates the processed table
3. `20250215000003_transform_walking_experiences_function.sql` - Creates the transformation function

You can apply these using:
- **Supabase Dashboard**: Go to SQL Editor and run each migration file
- **Supabase CLI**: Run `supabase db push` (if migrations are in the migrations folder)

## Step 2: Upload CSV Files

Upload the two CSV files to their respective tables:

### Upload `DOC_Walking_Experiences_Locations.csv` to `doc_walking_experiences_locations`

**Option A: Using Supabase Dashboard**
1. Go to Supabase Dashboard → Table Editor
2. Select `doc_walking_experiences_locations` table
3. Click "Insert" → "Import data from CSV"
4. Upload `DOC_Walking_Experiences_Locations.csv`
5. Map columns (they should match automatically)
6. Click "Import"

**Option B: Using Supabase CLI**
```bash
supabase db import --table doc_walking_experiences_locations DOC_Walking_Experiences_Locations.csv
```

**Option C: Using SQL COPY (via psql or SQL Editor)**
```sql
COPY public.doc_walking_experiences_locations (
    "Object ID", "Track name", "Description", "Difficulty", "Completion time",
    "Has alerts", "URL to thumbnail", "URL to webpage", "Date loaded to GIS", x, y
)
FROM '/path/to/DOC_Walking_Experiences_Locations.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ',', ENCODING 'UTF8');
```

### Upload `DOC_Walking_Experiences_Shape.csv` to `doc_walking_experiences_shape`

Follow the same steps as above, but:
- Table: `doc_walking_experiences_shape`
- File: `DOC_Walking_Experiences_Shape.csv`

**Note**: The CSV files may have a BOM (Byte Order Mark) at the start. If you encounter issues with the first column, you may need to remove the BOM or use UTF-8-SIG encoding.

## Step 3: Run the Transformation Function

Once both CSV files are uploaded, run the transformation function:

**Using Supabase Dashboard:**
1. Go to SQL Editor
2. Run this query:
```sql
SELECT transform_walking_experiences();
```

**Using Supabase CLI:**
```bash
supabase db execute "SELECT transform_walking_experiences();"
```

The function will:
- Join the two tables on "URL to webpage"
- Convert X/Y coordinates from NZTM2000 to lat/long using PostGIS
- Parse completion times and convert to minutes
- Determine kid-friendly status
- Populate the `walking_experiences_processed` table

## Step 4: Verify Results

Check that the data was transformed correctly:

```sql
-- Count rows
SELECT COUNT(*) FROM walking_experiences_processed;

-- Check a few sample rows
SELECT 
    track_name, 
    completion_min, 
    completion_max, 
    is_range, 
    kid_friendly,
    latitude,
    longitude,
    shape_length
FROM walking_experiences_processed
LIMIT 10;

-- Check coordinate conversion
SELECT 
    track_name,
    x_original,
    y_original,
    latitude,
    longitude
FROM walking_experiences_processed
WHERE latitude IS NOT NULL
LIMIT 10;
```

## Re-running the Transformation

If you update the raw CSV data, you can re-run the transformation function:

```sql
SELECT transform_walking_experiences();
```

**Note**: This will **truncate** (clear) the `walking_experiences_processed` table before repopulating it.

## Troubleshooting

### Issue: Column names not matching
- The CSV files use quoted column names with spaces. Make sure the table columns match exactly (including spaces and capitalization).

### Issue: BOM character in first column
- If "Object ID" column appears as "\ufeffObject ID", the CSV has a BOM. You can:
  - Remove the BOM using a text editor
  - Or modify the migration to handle it

### Issue: Coordinate conversion failing
- Ensure PostGIS extension is enabled (it should be by default in Supabase)
- Check that X and Y values are valid numbers

### Issue: Date parsing errors
- The date format in the CSV is "DD/MM/YYYY HH12:MI:SS AM"
- If dates fail to parse, they will be NULL in the processed table

## Table Structure

### Raw Tables (for CSV import)
- `doc_walking_experiences_locations` - Holds Locations CSV data
- `doc_walking_experiences_shape` - Holds Shape CSV data

### Processed Table
- `walking_experiences_processed` - Final transformed data ready for use

## Function Details

The `transform_walking_experiences()` function:
- Clears existing processed data
- Joins locations and shape tables
- Converts coordinates using PostGIS `ST_Transform`
- Parses completion times using helper functions
- Determines kid-friendly status
- Inserts all transformed data

The function returns the number of rows processed.
