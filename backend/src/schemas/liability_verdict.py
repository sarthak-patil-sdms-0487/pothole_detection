from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from .base import Base

class LiabilityVerdict(Base):
    __tablename__ = "liability_verdict"

    id = Column(Integer, primary_key=True, index=True)
    defect_id = Column(Integer, ForeignKey("defect.id"), nullable=True)
    tender_id = Column(Integer, ForeignKey("tender.id"), nullable=True)
    verdict = Column(String, nullable=False)  # IN_WARRANTY | OUT_OF_WARRANTY | DISPUTED | NO_MATCHING_CONTRACT
    confidence = Column(Float, nullable=True)
    rationale = Column(Text, nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)

    defect = relationship("Defect", backref="verdicts")
    tender = relationship("Tender", backref="verdicts")
