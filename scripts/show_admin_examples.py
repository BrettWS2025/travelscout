#!/usr/bin/env python3
import json
import sys
from pathlib import Path

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

project_root = Path(__file__).parent.parent
geojson_path = project_root / 'out' / 'nz_admin_areas.geojson'

with open(geojson_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("10 Examples of Admin Areas:\n")
for i, feature in enumerate(data['features'][:10], 1):
    props = feature['properties']
    level_name = 'Region' if props['admin_level'] == '4' else 'District'
    print(f"{i}. {props['name']}")
    print(f"   Admin Level: {props['admin_level']} ({level_name})")
    print(f"   OSM Type: {props['osm_type']}, OSM ID: {props['osm_id']}")
    print()
