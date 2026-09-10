from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from .base import Base

class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    defect_id = Column(Integer, ForeignKey("defect.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # BEFORE | AFTER
    photo_uri = Column(String, nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    captured_at = Column(DateTime, default=datetime.datetime.utcnow)
    hash = Column(String, nullable=True)

    defect = relationship("Defect", backref="evidences")
