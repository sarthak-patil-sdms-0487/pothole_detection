from sqlalchemy import Column, Integer, String, Text, Date, Numeric, Float, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Tender(Base):
    __tablename__ = "tender"

    id = Column(Integer, primary_key=True, index=True)
    tender_ref = Column(String, nullable=True, index=True)
    contractor_name = Column(String, nullable=True)
    contractor_contact_email = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    award_date = Column(Date, nullable=True)
    completion_date = Column(Date, nullable=True)
    value_inr = Column(Numeric, nullable=True)
    dlp_years = Column(Float, nullable=True)
    dlp_expiry_date = Column(Date, nullable=True)
    source_url = Column(String, nullable=True)
    dlp_source = Column(String, nullable=True)

    segments = relationship("TenderSegment", back_populates="tender", cascade="all, delete-orphan")


class TenderSegment(Base):
    __tablename__ = "tender_segment"

    tender_id = Column(Integer, ForeignKey("tender.id"), primary_key=True)
    segment_id = Column(Integer, ForeignKey("road_segment.id"), primary_key=True)

    tender = relationship("Tender", back_populates="segments")
    segment = relationship("RoadSegment")
