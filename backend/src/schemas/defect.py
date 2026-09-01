from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from .base import Base

class Defect(Base):
    __tablename__ = "defect"

    id = Column(Integer, primary_key=True, index=True)
    segment_id = Column(Integer, ForeignKey("road_segment.id"), nullable=True)
    state = Column(String, nullable=False, default="SIGHTING")  # SIGHTING | CONFIRMED | NOTICED | CLOSED
    first_seen_at = Column(DateTime, default=datetime.datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)
    noticed_at = Column(DateTime, nullable=True)
    sla_due_at = Column(DateTime, nullable=True)
    severity = Column(Float, nullable=True)
    promotion_reason = Column(String, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    breach_flag = Column(Boolean, default=False)

    segment = relationship("RoadSegment", backref="defects")
