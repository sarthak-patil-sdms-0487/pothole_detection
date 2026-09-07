from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from .base import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    
    # Analysis details
    original_image_url = Column(String, nullable=False)
    annotated_image_url = Column(String, nullable=False)
    detection_method = Column(String, nullable=True)
    camera_params = Column(JSON, nullable=True)
    pothole_details = Column(JSON, nullable=True)
    
    # User-reported details
    user_pothole_count = Column(Integer, nullable=True)
    lat = Column(Float, index=True, nullable=True)
    lng = Column(Float, index=True, nullable=True)
    address = Column(String, nullable=True)
    status = Column(String, default="Pending Analysis")
    reportedBy = Column(String, nullable=True)
    reportedDate = Column(DateTime, default=datetime.datetime.utcnow)
    severity = Column(String, nullable=True)
    message = Column(String, nullable=True)
    
    # Consolidated fields
    estSize = Column(String, nullable=True)

    # Staged-notice lifecycle & attribution extensions
    defect_id = Column(Integer, ForeignKey("defect.id"), nullable=True)
    segment_id = Column(Integer, ForeignKey("road_segment.id"), nullable=True)
    capture_source = Column(String, nullable=True)  # WORKER | SURVEY | OPPORTUNISTIC
    survey_run_id = Column(Integer, ForeignKey("survey_run.id"), nullable=True)

    # Relationships
    defect = relationship("Defect", backref="reports")
    segment = relationship("RoadSegment", backref="reports")
    survey_run = relationship("SurveyRun", backref="reports")
