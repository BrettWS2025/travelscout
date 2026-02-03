#!/usr/bin/env python3
"""
Extract places from OSM PBF file.
Filters: place=* AND name=*
Output: CSV with country_code, osm_type, osm_id, place_type, name variants, lat, lon, full tags (JSON)
"""

import csv
import json
import sys
from pathlib import Path

try:
    import osmium
except ImportError:
    print("Error: osmium-tool not installed. Install with: pip install osmium")
    sys.exit(1)


class PlaceExtractor(osmium.SimpleHandler):
    def __init__(self, writer):
        osmium.SimpleHandler.__init__(self)
        self.writer = writer
        self.count = 0

    def node(self, n):
        """Process OSM nodes (points)"""
        if 'place' in n.tags and 'name' in n.tags:
            self._write_place('node', n.id, n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        """Process OSM ways (may have place tags)"""
        if 'place' in w.tags and 'name' in w.tags:
            # For ways, we need to calculate centroid from nodes
            # For now, skip ways without coordinates (they're referenced by relations)
            # Most place=* ways are actually areas, but we'll handle them if they have coordinates
            pass

    def relation(self, r):
        """Process OSM relations (may have place tags)"""
        if 'place' in r.tags and 'name' in r.tags:
            # Relations don't have direct coordinates
            # They reference ways/nodes, so we'd need to calculate centroid
            # For now, skip relations (most place=* are nodes anyway)
            pass

    def _write_place(self, osm_type, osm_id, tags, lat, lon):
        """Write a place to CSV"""
        place_type = tags.get('place', '')
        name = tags.get('name', '')
        
        # Collect name variants
        name_variants = {}
        name_fields = ['name', 'name:en', 'name:mi', 'alt_name', 'old_name', 'official_name', 'short_name']
        for field in name_fields:
            if field in tags:
                name_variants[field] = tags[field]
        
        # Get country code from tags or infer from data
        country_code = tags.get('addr:country', 'NZ')  # Default to NZ for New Zealand data
        if country_code and len(country_code) > 2:
            # Sometimes it's "New Zealand", extract code
            country_code = 'NZ'
        
        # Convert all tags to JSON
        all_tags = dict(tags)
        
        # Write to CSV
        self.writer.writerow({
            'country_code': country_code,
            'osm_type': osm_type,
            'osm_id': str(osm_id),
            'place_type': place_type,
            'name': name,
            'name_variants': json.dumps(name_variants, ensure_ascii=False),
            'lat': lat,
            'lon': lon,
            'tags': json.dumps(all_tags, ensure_ascii=False)
        })
        self.count += 1
        
        if self.count % 1000 == 0:
            print(f"Extracted {self.count} places...", file=sys.stderr)


def main():
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    pbf_path = project_root / 'data' / 'new-zealand-260201.osm.pbf'
    output_dir = project_root / 'out'
    output_file = output_dir / 'nz_places.csv'
    
    # Create output directory
    output_dir.mkdir(exist_ok=True)
    
    if not pbf_path.exists():
        print(f"Error: PBF file not found at {pbf_path}")
        sys.exit(1)
    
    print(f"Extracting places from {pbf_path}...")
    print(f"Output: {output_file}")
    
    # Open CSV file for writing
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['country_code', 'osm_type', 'osm_id', 'place_type', 'name', 
                     'name_variants', 'lat', 'lon', 'tags']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        # Create extractor and apply to PBF
        extractor = PlaceExtractor(writer)
        extractor.apply_file(str(pbf_path), locations=True)
    
    print(f"\nExtraction complete! Extracted {extractor.count} places.")
    print(f"Output saved to: {output_file}")


if __name__ == '__main__':
    main()
