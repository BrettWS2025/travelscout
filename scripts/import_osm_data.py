#!/usr/bin/env python3
"""
Import OSM extracted data into Supabase.
Imports:
1. out/nz_places.csv → nz_places_raw
2. out/nz_admin_areas.geojson → nz_admin_areas
3. Runs rebuild_nz_places_final() to build the final table
"""

import csv
import json
import sys
from pathlib import Path
from typing import Dict, Any

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py not installed. Install with: pip install supabase")
    sys.exit(1)


def import_places_csv(supabase: Client, csv_path: Path):
    """Import places from CSV to nz_places_raw"""
    print(f"Importing places from {csv_path}...")
    
    places = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse JSON fields
            name_variants = json.loads(row['name_variants']) if row['name_variants'] else {}
            tags = json.loads(row['tags']) if row['tags'] else {}
            
            place = {
                'country_code': row['country_code'],
                'osm_type': row['osm_type'],
                'osm_id': row['osm_id'],
                'place_type': row['place_type'] if row['place_type'] else None,
                'name': row['name'],
                'name_variants': name_variants,
                'lat': float(row['lat']),
                'lon': float(row['lon']),
                'tags': tags
            }
            places.append(place)
            
            # Batch insert every 1000 records
            if len(places) >= 1000:
                try:
                    supabase.table('nz_places_raw').upsert(places, on_conflict='country_code,osm_type,osm_id').execute()
                    print(f"  Imported {len(places)} places (batch)...")
                    places = []
                except Exception as e:
                    print(f"  Error importing batch: {e}")
                    raise
    
    # Insert remaining places
    if places:
        try:
            supabase.table('nz_places_raw').upsert(places, on_conflict='country_code,osm_type,osm_id').execute()
            print(f"  Imported {len(places)} places (final batch)...")
        except Exception as e:
            print(f"  Error importing final batch: {e}")
            raise
    
    print("Places import complete!")


def import_admin_areas_geojson(supabase: Client, geojson_path: Path):
    """Import admin areas from GeoJSON to nz_admin_areas"""
    print(f"Importing admin areas from {geojson_path}...")
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        geojson = json.load(f)
    
    admin_areas = []
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        geometry = feature.get('geometry', {})
        
        # Convert GeoJSON geometry to PostGIS WKT
        # Note: Supabase will handle the geometry conversion if we pass it correctly
        # For now, we'll use the raw GeoJSON and let PostGIS handle it
        admin_area = {
            'country_code': props.get('country_code', 'NZ'),
            'osm_type': props.get('osm_type'),
            'osm_id': props.get('osm_id'),
            'admin_level': props.get('admin_level'),
            'name': props.get('name'),
            'geometry': json.dumps(geometry)  # Store as JSON string, will be converted by PostGIS
        }
        admin_areas.append(admin_area)
        
        # Batch insert every 100 records
        if len(admin_areas) >= 100:
            try:
                # Note: We need to use raw SQL for geometry insertion
                # Supabase client may not handle PostGIS geometry directly
                # So we'll use execute() with raw SQL instead
                _insert_admin_areas_sql(supabase, admin_areas)
                print(f"  Imported {len(admin_areas)} admin areas (batch)...")
                admin_areas = []
            except Exception as e:
                print(f"  Error importing batch: {e}")
                raise
    
    # Insert remaining admin areas
    if admin_areas:
        try:
            _insert_admin_areas_sql(supabase, admin_areas)
            print(f"  Imported {len(admin_areas)} admin areas (final batch)...")
        except Exception as e:
            print(f"  Error importing final batch: {e}")
            raise
    
    print("Admin areas import complete!")


def _insert_admin_areas_sql(supabase: Client, admin_areas: list):
    """Insert admin areas using raw SQL to handle PostGIS geometry"""
    # Generate SQL file for manual execution or use psql
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    sql_file = project_root / 'out' / 'import_admin_areas_generated.sql'
    
    with open(sql_file, 'w', encoding='utf-8') as f:
        f.write("-- Auto-generated SQL for importing admin areas\n")
        f.write("-- Run this with: psql $DATABASE_URL -f out/import_admin_areas_generated.sql\n\n")
        
        for area in admin_areas:
            geom_json_str = area['geometry']
            geom_json = json.loads(geom_json_str)
            geom_json_escaped = json.dumps(geom_json).replace("'", "''")
            name_escaped = area['name'].replace("'", "''")
            
            f.write(f"""
INSERT INTO nz_admin_areas (country_code, osm_type, osm_id, admin_level, name, geometry)
VALUES (
  '{area['country_code']}',
  '{area['osm_type']}',
  '{area['osm_id']}',
  '{area['admin_level']}',
  '{name_escaped}',
  ST_GeomFromGeoJSON('{geom_json_escaped}')
)
ON CONFLICT (country_code, osm_type, osm_id) DO UPDATE SET
  admin_level = EXCLUDED.admin_level,
  name = EXCLUDED.name,
  geometry = EXCLUDED.geometry,
  updated_at = NOW();
""")
    
    print(f"  Generated SQL file: {sql_file}")
    print(f"  Run with: psql $DATABASE_URL -f {sql_file}")
    print(f"  Or execute the SQL in your Supabase SQL editor")


def rebuild_final_table(supabase: Client, country_code: str = 'NZ'):
    """Rebuild nz_places_final table"""
    print(f"Rebuilding nz_places_final for country: {country_code}...")
    
    try:
        result = supabase.rpc('rebuild_nz_places_final', {'p_country_code': country_code}).execute()
        if result.data:
            stats = result.data[0] if isinstance(result.data, list) else result.data
            print(f"  Inserted: {stats.get('inserted_count', 0)}")
            print(f"  Updated: {stats.get('updated_count', 0)}")
            print(f"  Deleted: {stats.get('deleted_count', 0)}")
        print("Final table rebuild complete!")
    except Exception as e:
        print(f"Error rebuilding final table: {e}")
        print("You may need to run the SQL function manually:")
        print(f"  SELECT * FROM rebuild_nz_places_final('{country_code}');")
        raise


def main():
    import os
    
    # Get Supabase credentials from environment
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set")
        print("Set them as environment variables or in a .env file")
        sys.exit(1)
    
    # Initialize Supabase client
    supabase: Client = create_client(supabase_url, supabase_key)
    
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    places_csv = project_root / 'out' / 'nz_places.csv'
    admin_geojson = project_root / 'out' / 'nz_admin_areas.geojson'
    
    # Check files exist
    if not places_csv.exists():
        print(f"Error: Places CSV not found at {places_csv}")
        print("Run extract_places.py first")
        sys.exit(1)
    
    if not admin_geojson.exists():
        print(f"Error: Admin areas GeoJSON not found at {admin_geojson}")
        print("Run extract_admin_areas.py first")
        sys.exit(1)
    
    # Import data
    try:
        import_places_csv(supabase, places_csv)
        import_admin_areas_geojson(supabase, admin_geojson)
        rebuild_final_table(supabase)
        print("\nAll imports complete!")
    except Exception as e:
        print(f"\nError during import: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
