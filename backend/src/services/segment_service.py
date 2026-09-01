from typing import Optional, List, Tuple
import logging
from shapely.geometry import LineString, Point
from shapely.ops import transform
import pyproj
from sqlalchemy.orm import Session
from ..config.database import SessionLocal
from ..schemas.road_segment import RoadSegment

logger = logging.getLogger(__name__)

# Coordinate transformer: WGS84 (EPSG:4326) -> UTM Zone 43N (EPSG:32643) for Western India (Maharashtra)
# Note: always_xy=True ensures input is (lng, lat) -> (easting_m, northing_m)
transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)

# Module-level cache: list of (segment_id, name, projected_shapely_linestring)
_cached_segments: Optional[List[Tuple[int, str, LineString]]] = None

def load_segments_cache(db: Optional[Session] = None) -> List[Tuple[int, str, LineString]]:
    """
    Loads all road segments from the database and projects their geometries to metric UTM space.
    Caches the result in-memory for sub-millisecond lookups.
    """
    global _cached_segments
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        segments = db.query(RoadSegment).all()
        cached = []
        for seg in segments:
            if not seg.geometry or "coordinates" not in seg.geometry:
                continue
            
            raw_coords = seg.geometry["coordinates"] # [[lng, lat], ...]
            # Project each [lng, lat] point to metric UTM [x_m, y_m]
            projected_coords = [transformer.transform(lng, lat) for lng, lat in raw_coords]
            
            if len(projected_coords) >= 2:
                metric_line = LineString(projected_coords)
                cached.append((seg.id, seg.name or f"Segment #{seg.id}", metric_line))
        
        _cached_segments = cached
        logger.info(f"[SEGMENT_SERVICE] Loaded and projected {len(cached)} road segments into memory cache.")
        return _cached_segments
    finally:
        if should_close_db:
            db.close()

def reload_segments_cache(db: Optional[Session] = None) -> List[Tuple[int, str, LineString]]:
    """Forces reloading of the in-memory road segments cache."""
    return load_segments_cache(db)

def match_segment(lat: Optional[float], lng: Optional[float], tolerance_m: float = 30.0, db: Optional[Session] = None) -> Optional[int]:
    """
    Resolves an incoming GPS coordinate (lat, lng) to the nearest road segment within tolerance.
    
    :param lat: Latitude in WGS84
    :param lng: Longitude in WGS84
    :param tolerance_m: Distance tolerance in meters (default: 30.0m)
    :param db: Optional SQLAlchemy session
    :return: segment_id if matched within tolerance, else None
    """
    if lat is None or lng is None:
        return None

    global _cached_segments
    if _cached_segments is None:
        load_segments_cache(db)

    if not _cached_segments:
        return None

    # Project incoming point (lng, lat) -> (point_x_m, point_y_m)
    point_x, point_y = transformer.transform(lng, lat)
    query_point = Point(point_x, point_y)

    nearest_seg_id = None
    min_dist_m = float("inf")

    for seg_id, seg_name, metric_line in _cached_segments:
        dist_m = metric_line.distance(query_point)
        if dist_m < min_dist_m:
            min_dist_m = dist_m
            nearest_seg_id = seg_id

    if nearest_seg_id is not None and min_dist_m <= tolerance_m:
        logger.info(f"[SEGMENT_SERVICE] Point ({lat}, {lng}) matched Segment #{nearest_seg_id} at distance {min_dist_m:.2f}m")
        return nearest_seg_id

    logger.info(f"[SEGMENT_SERVICE] Point ({lat}, {lng}) closest segment was #{nearest_seg_id} at {min_dist_m:.2f}m (exceeds tolerance {tolerance_m}m) -> returning None")
    return None
