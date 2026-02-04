#!/usr/bin/env python3
"""
Extract administrative boundaries from OSM PBF file.
Filters: boundary=administrative, name=*, admin_level in (4, 6)
Output: GeoJSON with country_code, osm_type, osm_id, admin_level, name, polygon geometry

Optimized: Only loads nodes that belong to ways used by admin boundaries.
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

try:
    import osmium
except ImportError:
    print("Error: osmium-tool not installed. Install with: pip install osmium")
    sys.exit(1)

try:
    from shapely.geometry import Polygon, mapping
except ImportError:
    print("Error: shapely not installed. Install with: pip install shapely")
    sys.exit(1)


class AdminRelationCollector(osmium.SimpleHandler):
    """First pass: Collect admin boundary relations and their member way IDs"""
    def __init__(self):
        osmium.SimpleHandler.__init__(self)
        self.admin_relations = []
        self.admin_way_ids = set()  # Ways that are admin boundaries themselves
        self.required_way_ids = set()  # Ways referenced by admin relations
        
    def way(self, w):
        """Check if way itself is an admin boundary"""
        if ('boundary' in w.tags and w.tags['boundary'] == 'administrative' and
            'name' in w.tags and 'admin_level' in w.tags):
            admin_level = w.tags.get('admin_level', '')
            if admin_level in ('4', '6'):
                self.admin_way_ids.add(w.id)
                self.admin_relations.append({
                    'id': w.id,
                    'tags': dict(w.tags),
                    'members': [('w', w.id, 'outer')],
                    'is_way': True
                })
    
    def relation(self, r):
        """Collect admin boundary relations"""
        if ('boundary' in r.tags and r.tags['boundary'] == 'administrative' and
            'name' in r.tags and 'admin_level' in r.tags):
            admin_level = r.tags.get('admin_level', '')
            if admin_level in ('4', '6'):
                # Collect way IDs from relation members
                way_ids = []
                for member in r.members:
                    if member.type == 'w':
                        way_ids.append(member.ref)
                        self.required_way_ids.add(member.ref)
                
                if way_ids:
                    self.admin_relations.append({
                        'id': r.id,
                        'tags': dict(r.tags),
                        'members': [(m.type, m.ref, m.role) for m in r.members],
                        'is_way': False
                    })


class WayCollector(osmium.SimpleHandler):
    """Second pass: Collect only ways that are needed for admin boundaries"""
    def __init__(self, required_way_ids):
        osmium.SimpleHandler.__init__(self)
        self.required_way_ids = required_way_ids
        self.ways = {}  # Store way node references
        self.required_node_ids = set()  # Nodes we need to load
        
    def way(self, w):
        """Only store ways that are needed"""
        if w.id in self.required_way_ids:
            node_ids = [node.ref for node in w.nodes]
            self.ways[w.id] = {
                'nodes': node_ids,
                'tags': dict(w.tags)
            }
            # Collect all node IDs we need
            self.required_node_ids.update(node_ids)


class NodeCollector(osmium.SimpleHandler):
    """Third pass: Collect only nodes that belong to required ways"""
    def __init__(self, required_node_ids):
        osmium.SimpleHandler.__init__(self)
        self.required_node_ids = required_node_ids
        self.nodes = {}
        
    def node(self, n):
        """Only store nodes we need"""
        if n.id in self.required_node_ids:
            self.nodes[n.id] = (n.location.lon, n.location.lat)


class AdminAreaBuilder:
    """Build admin area polygons from collected data"""
    def __init__(self, admin_relations, ways, nodes):
        self.admin_relations = admin_relations
        self.ways = ways
        self.nodes = nodes
        self.admin_areas = []
        self.count = 0
    
    def _get_way_coords(self, way_id):
        """Get coordinates for a way"""
        if way_id not in self.ways:
            return None
        
        way = self.ways[way_id]
        coords = []
        for node_id in way['nodes']:
            if node_id in self.nodes:
                coords.append(self.nodes[node_id])
        
        if len(coords) < 3:
            return None
        
        return coords
    
    def _process_admin_area(self, osm_type, osm_id, tags, coords):
        """Process and store an admin area"""
        if len(coords) < 3:
            return
        
        # Create polygon (close the ring if needed)
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        
        try:
            polygon = Polygon(coords)
            if not polygon.is_valid:
                # Try to fix invalid polygon
                polygon = polygon.buffer(0)
            
            if polygon.is_valid and polygon.area > 0:
                country_code = tags.get('addr:country', 'NZ')
                if country_code and len(country_code) > 2:
                    country_code = 'NZ'
                
                self.admin_areas.append({
                    'country_code': country_code,
                    'osm_type': osm_type,
                    'osm_id': str(osm_id),
                    'admin_level': tags.get('admin_level', ''),
                    'name': tags.get('name', ''),
                    'geometry': mapping(polygon)
                })
                self.count += 1
                
                if self.count % 10 == 0:
                    print(f"  Built {self.count} admin areas...", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Could not create polygon for {osm_type}/{osm_id}: {e}", file=sys.stderr)
    
    def build_all(self):
        """Build all admin area polygons"""
        for rel in self.admin_relations:
            outer_ways = []
            inner_ways = []
            
            # Handle standalone ways (admin boundaries that are just ways, not relations)
            if rel.get('is_way', False):
                coords = self._get_way_coords(rel['id'])
                if coords:
                    self._process_admin_area('way', rel['id'], rel['tags'], coords)
                continue
            
            # Collect outer and inner ways for relations
            for member_type, member_id, role in rel['members']:
                if member_type == 'w':
                    coords = self._get_way_coords(member_id)
                    if coords:
                        if role == 'outer' or role == '':
                            outer_ways.append(coords)
                        elif role == 'inner':
                            inner_ways.append(coords)
            
            if not outer_ways:
                continue
            
            # Merge outer ways into a single polygon
            try:
                # Combine all outer rings
                all_coords = []
                for way_coords in outer_ways:
                    if way_coords[0] != way_coords[-1]:
                        way_coords.append(way_coords[0])
                    all_coords.extend(way_coords[:-1])  # Remove duplicate closing point
                
                if len(all_coords) >= 3:
                    # Close the ring
                    if all_coords[0] != all_coords[-1]:
                        all_coords.append(all_coords[0])
                    
                    polygon = Polygon(all_coords)
                    if not polygon.is_valid:
                        polygon = polygon.buffer(0)
                    
                    # Apply inner rings (holes) if any
                    if inner_ways and polygon.is_valid:
                        holes = []
                        for inner_coords in inner_ways:
                            if len(inner_coords) >= 3:
                                if inner_coords[0] != inner_coords[-1]:
                                    inner_coords.append(inner_coords[0])
                                try:
                                    hole = Polygon(inner_coords)
                                    if hole.is_valid:
                                        holes.append(hole.exterior.coords[:-1])  # Remove duplicate
                                except:
                                    pass
                        
                        if holes:
                            try:
                                polygon = Polygon(polygon.exterior.coords[:-1], holes)
                            except:
                                pass
                    
                    if polygon.is_valid and polygon.area > 0:
                        country_code = rel['tags'].get('addr:country', 'NZ')
                        if country_code and len(country_code) > 2:
                            country_code = 'NZ'
                        
                        self.admin_areas.append({
                            'country_code': country_code,
                            'osm_type': 'relation',
                            'osm_id': str(rel['id']),
                            'admin_level': rel['tags'].get('admin_level', ''),
                            'name': rel['tags'].get('name', ''),
                            'geometry': mapping(polygon)
                        })
                        self.count += 1
                        
                        if self.count % 10 == 0:
                            print(f"  Built {self.count} admin areas...", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Could not process relation {rel['id']}: {e}", file=sys.stderr)


def main():
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    pbf_path = project_root / 'data' / 'new-zealand-260201.osm.pbf'
    output_dir = project_root / 'out'
    output_file = output_dir / 'nz_admin_areas.geojson'
    
    # Create output directory
    output_dir.mkdir(exist_ok=True)
    
    if not pbf_path.exists():
        print(f"Error: PBF file not found at {pbf_path}")
        sys.exit(1)
    
    print(f"Extracting admin areas from {pbf_path}...")
    print(f"Output: {output_file}")
    print()
    
    # Pass 1: Find admin relations and collect way IDs
    print("Pass 1: Identifying admin boundaries and collecting way IDs...")
    relation_collector = AdminRelationCollector()
    relation_collector.apply_file(str(pbf_path), locations=False)  # No locations needed yet
    print(f"  Found {len(relation_collector.admin_relations)} admin boundaries")
    
    # Combine way IDs from relations and standalone admin ways
    all_required_way_ids = relation_collector.required_way_ids | relation_collector.admin_way_ids
    print(f"  Need to load {len(all_required_way_ids)} ways")
    
    if not all_required_way_ids:
        print("No admin boundaries found!")
        sys.exit(0)
    
    # Pass 2: Collect only required ways and their node IDs
    print("Pass 2: Loading required ways and collecting node IDs...")
    way_collector = WayCollector(all_required_way_ids)
    way_collector.apply_file(str(pbf_path), locations=False)
    print(f"  Loaded {len(way_collector.ways)} ways")
    print(f"  Need to load {len(way_collector.required_node_ids)} nodes")
    
    # Pass 3: Collect only required nodes
    print("Pass 3: Loading required nodes...")
    node_collector = NodeCollector(way_collector.required_node_ids)
    node_collector.apply_file(str(pbf_path), locations=True)  # Now we need locations
    print(f"  Loaded {len(node_collector.nodes)} nodes")
    
    # Build polygons
    print("Pass 4: Building polygons...")
    builder = AdminAreaBuilder(
        relation_collector.admin_relations,
        way_collector.ways,
        node_collector.nodes
    )
    builder.build_all()
    
    # Create GeoJSON FeatureCollection
    features = []
    for area in builder.admin_areas:
        features.append({
            'type': 'Feature',
            'properties': {
                'country_code': area['country_code'],
                'osm_type': area['osm_type'],
                'osm_id': area['osm_id'],
                'admin_level': area['admin_level'],
                'name': area['name']
            },
            'geometry': area['geometry']
        })
    
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }
    
    # Write GeoJSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    
    print(f"\nExtraction complete! Extracted {builder.count} admin areas.")
    print(f"Output saved to: {output_file}")


if __name__ == '__main__':
    main()
