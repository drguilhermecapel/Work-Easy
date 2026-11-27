"""Build WorkEasy's local OSM dataset, display tiles and searchable places."""
import argparse
import bz2
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
ARCHIVE = HERE / "saude.osm.bz2"
TILES = HERE.parent / "public" / "maps" / "saude.pmtiles"
BOUNDS = (-46.6430, -23.6230, -46.6350, -23.6160)
AREA = "Saúde"
# Keep routability (one way, turn restrictions and access), cartography and search.
FIELDS = set("""
name ref type addr highway junction oneway access vehicle motor_vehicle motorcar
motorcycle barrier maxspeed minspeed maxheight maxwidth maxweight maxlength hgv
surface smoothness tracktype service lanes turn restriction except route ferry
bridge tunnel toll layer railway waterway natural water landuse leisure amenity
shop tourism public_transport building place population entrance roundabout area
destination driving_side incline construction impassable width ford traffic_signals
""".split())


def read_xml(path):
    opener = bz2.open if path.suffix == ".bz2" else open
    with opener(path, "rb") as data:
        return ET.parse(data).getroot()


def tags(item):
    return {t.get("k"): t.get("v") for t in item.findall("tag")}


def snapshot(source):
    root = read_xml(source)
    out = ET.Element("osm", version="0.6", generator="WorkEasy local map")
    for item in root:
        if item.tag not in {"node", "way", "relation"}:
            continue
        copy = ET.SubElement(out, item.tag, {k: v for k, v in item.attrib.items()
                                            if k in {"id", "lat", "lon"}})
        for child in item:
            if child.tag in {"nd", "member"} or (
                child.tag == "tag" and child.get("k", "").split(":")[0] in FIELDS
            ):
                ET.SubElement(copy, child.tag, dict(child.attrib))
    with bz2.open(ARCHIVE, "wb") as f:
        ET.ElementTree(out).write(f, encoding="utf-8", xml_declaration=True)


def inside(point):
    lon, lat = point
    return BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]


def features():
    root = read_xml(ARCHIVE)
    nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in root.iter("node")}
    for item in root:
        t = tags(item)
        if item.tag == "node":
            coords = [nodes[item.get("id")]]
        elif item.tag == "way":
            coords = [nodes[n.get("ref")] for n in item.findall("nd") if n.get("ref") in nodes]
        else:
            continue
        local = [p for p in coords if inside(p)]
        if not local or not t:
            continue
        # An anchor suggests a street or POI; users confirm the actual entrance.
        center = tuple(sum(p[i] for p in local) / len(local) for i in (0, 1))
        point = min(local, key=lambda p: (p[0]-center[0])**2 + (p[1]-center[1])**2)
        name = t.get("name", "")
        street = t.get("addr:street", "")
        address = " ".join(filter(None, (street, t.get("addr:housenumber", ""))))
        place = t.get("amenity") or t.get("shop") or t.get("tourism") or t.get("public_transport")
        kind = "address" if address else ("place" if place else "street")
        label = " · ".join(dict.fromkeys(filter(None, (name, address))))
        searchable = label and (address or place or t.get("highway") or t.get("leisure"))
        row = (item.tag, int(item.get("id")), label[:200], AREA, point[1], point[0], kind) if searchable else None
        feature = None
        if item.tag == "way" and len(coords) >= 2:
            closed = len(coords) >= 4 and coords[0] == coords[-1]
            if t.get("highway"):
                typ, geom, value = "road", "LineString", coords
            elif closed and (t.get("natural") == "water" or t.get("water")):
                typ, geom, value = "water", "Polygon", [coords]
            elif closed and (t.get("leisure") or t.get("landuse") in ("forest", "grass", "recreation_ground")):
                typ, geom, value = "green", "Polygon", [coords]
            elif closed and t.get("building"):
                typ, geom, value = "building", "Polygon", [coords]
            else:
                yield row, None
                continue
            feature = {"type": "Feature", "properties": {"kind": typ, "name": name},
                       "geometry": {"type": geom, "coordinates": value}}
        elif place and name:
            feature = {"type": "Feature", "properties": {"kind": "poi", "name": name},
                       "geometry": {"type": "Point", "coordinates": point}}
        yield row, feature


def make_tiles():
    collection = {"type": "FeatureCollection", "features": [f for _, f in features() if f]}
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "context.geojson"
        output = Path(tmp) / "saude.pmtiles"
        source.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
        subprocess.run(["ogr2ogr", "-f", "PMTiles", str(output), str(source), "-nln", "context",
                        "-dsco", "MINZOOM=12", "-dsco", "MAXZOOM=16",
                        "-dsco", "NAME=WorkEasy Saúde", "-dsco", "TYPE=baselayer",
                        "-clipsrc", *map(str, BOUNDS)], check=True)
        TILES.write_bytes(output.read_bytes())


def import_sql():
    print("""BEGIN;
DO $$ BEGIN
 IF (SELECT environment FROM private.ride_deployment WHERE singleton) IS DISTINCT FROM 'simulation'
 THEN RAISE EXCEPTION 'Local map import requires a simulation project'; END IF;
END $$;
CREATE TEMP TABLE imported_places
 (LIKE private.ride_places_osm INCLUDING DEFAULTS) ON COMMIT DROP;
COPY imported_places (osm_type,osm_id,label,area,lat,lng,kind) FROM STDIN WITH (FORMAT csv);""")
    writer = csv.writer(sys.stdout, lineterminator="\n", quoting=csv.QUOTE_ALL)
    for row, _ in features():
        if row:
            writer.writerow(row)
    print(r"\.")
    print("""DELETE FROM private.ride_places_osm WHERE area='Saúde'
 AND lng BETWEEN -46.6430 AND -46.6350 AND lat BETWEEN -23.6230 AND -23.6160;
INSERT INTO private.ride_places_osm (osm_type,osm_id,label,area,lat,lng,kind)
 SELECT osm_type,osm_id,label,area,lat,lng,kind FROM imported_places
 ON CONFLICT (osm_type,osm_id) DO UPDATE SET label=excluded.label, area=excluded.area,
 lat=excluded.lat, lng=excluded.lng, kind=excluded.kind;
INSERT INTO private.ride_route_areas(environment,area,boundary,source_ref)
 VALUES ('simulation','Saúde','((-46.6430,-23.6230),(-46.6350,-23.6230),(-46.6350,-23.6160),(-46.6430,-23.6160))'::polygon,'osm-saude-demo-v1')
 ON CONFLICT(environment,area) DO UPDATE SET boundary=excluded.boundary,source_ref=excluded.source_ref;
COMMIT;""")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("snapshot").add_argument("osm_xml", type=Path)
    sub.add_parser("tiles")
    sub.add_parser("import-sql")
    args = parser.parse_args()
    if args.cmd == "snapshot":
        snapshot(args.osm_xml)
    elif args.cmd == "tiles":
        make_tiles()
    else:
        import_sql()
