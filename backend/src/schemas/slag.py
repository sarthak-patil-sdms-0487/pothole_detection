from sqlalchemy import Column, Integer, String, Float, Numeric, Date, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class SlagLot(Base):
    __tablename__ = "slag_lot"

    id = Column(Integer, primary_key=True, index=True)
    tenant_unit_name = Column(String, nullable=False)
    estate_id = Column(Integer, ForeignKey("estate.id"), nullable=True)
    generated_month = Column(Date, nullable=True)
    tonnes = Column(Float, nullable=False, default=0.0)
    stockpile_location = Column(String, nullable=True)

    estate = relationship("Estate", backref="slag_lots")


class SlagDraw(Base):
    __tablename__ = "slag_draw"

    id = Column(Integer, primary_key=True, index=True)
    slag_lot_id = Column(Integer, ForeignKey("slag_lot.id"), nullable=False)
    repair_job_id = Column(Integer, ForeignKey("repair_job.id"), nullable=False)
    kg_drawn = Column(Float, nullable=False, default=0.0)
    notional_value_inr = Column(Numeric, nullable=True)

    slag_lot = relationship("SlagLot", backref="draws")
    repair_job = relationship("RepairJob", backref="slag_draws")
