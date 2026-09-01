import sys
import os
import json
from sqlalchemy.orm import Session

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.database import engine, init_db, SessionLocal
from src.schemas import Estate, RoadSegment

def load_segments():
    print("[GAZETTEER] Initializing database and loading road segments...")
    init_db()
    
    db: Session = SessionLocal()
    try:
        # 1. Ensure Pilot Estate exists
        estate = db.query(Estate).filter(Estate.name == "MIDC Chakan Industrial Area (Phase II)").first()
        if not estate:
            estate = Estate(
                name="MIDC Chakan Industrial Area (Phase II)",
                config_json={
                    "confirm_repeat_threshold": 2,
                    "notice_threshold": 2.5,
                    "w_severity": 1.0,
                    "w_traffic": 0.8,
                    "w_gate_proximity": 0.5,
                    "w_active_dlp": 0.6,
                    "w_age": 0.1
                }
            )
            db.add(estate)
            db.commit()
            db.refresh(estate)
            print(f"[GAZETTEER] Created pilot estate: {estate.name} (id={estate.id})")
        else:
            print(f"[GAZETTEER] Found existing estate: {estate.name} (id={estate.id})")

        # 2. Check existing segments
        existing_count = db.query(RoadSegment).filter(RoadSegment.estate_id == estate.id).count()
        if existing_count >= 30:
            print(f"[GAZETTEER] Found {existing_count} existing road segments in DB, skipping re-insertion.")
            return

        # 3. Load GeoJSON file
        geojson_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/segments.geojson"))
        with open(geojson_path, "r", encoding="utf-8") as f:
            geojson_data = json.load(f)

        features = geojson_data.get("features", [])
        print(f"[GAZETTEER] Loading {len(features)} road segment features from {geojson_path}...")

        inserted_count = 0
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            seg_name = props.get("name")
            
            existing = db.query(RoadSegment).filter(
                RoadSegment.estate_id == estate.id,
                RoadSegment.name == seg_name
            ).first()

            if not existing:
                segment = RoadSegment(
                    estate_id=estate.id,
                    name=seg_name,
                    geometry=geom,
                    length_m=props.get("length_m", 500.0),
                    owner="SIDC",
                    traffic_class=props.get("traffic_class", "MEDIUM"),
                    traffic_class_weight=props.get("traffic_class_weight", 1.0),
                    near_gate_or_weighbridge=props.get("near_gate_or_weighbridge", False),
                    has_active_dlp=props.get("has_active_dlp", False)
                )
                db.add(segment)
                inserted_count += 1

        db.commit()
        print(f"[GAZETTEER] Successfully loaded {inserted_count} road segments into 'road_segment' table!")
        
    finally:
        db.close()

if __name__ == "__main__":
    load_segments()
