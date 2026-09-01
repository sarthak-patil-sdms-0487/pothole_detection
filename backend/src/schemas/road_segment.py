from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from .base import Base

class RoadSegment(Base):
    __tablename__ = "road_segment"

    id = Column(Integer, primary_key=True, index=True)
    estate_id = Column(Integer, ForeignKey("estate.id"), nullable=True)
    name = Column(String, nullable=True)
    geometry = Column(JSON, nullable=True)  # GeoJSON LineString
    length_m = Column(Float, nullable=True)
    owner = Column(String, default="SIDC")
    traffic_class = Column(String, nullable=True)
    traffic_class_weight = Column(Float, default=0.0)
    near_gate_or_weighbridge = Column(Boolean, default=False)
    has_active_dlp = Column(Boolean, default=False)
    last_inspected_at = Column(DateTime, nullable=True)

    estate = relationship("Estate", backref="segments")
