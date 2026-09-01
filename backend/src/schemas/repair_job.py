from sqlalchemy import Column, Integer, String, Float, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class RepairJob(Base):
    __tablename__ = "repair_job"

    id = Column(Integer, primary_key=True, index=True)
    defect_id = Column(Integer, ForeignKey("defect.id"), nullable=True)
    assigned_to = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    material_type = Column(String, nullable=True)
    material_kg = Column(Float, nullable=True)
    cost_inr = Column(Numeric, nullable=True)

    defect = relationship("Defect", backref="repair_jobs")
