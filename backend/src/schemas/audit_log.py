from sqlalchemy import Column, Integer, String, Text, DateTime
import datetime
from .base import Base

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    entity = Column(String, nullable=False)  # defect | report | tender | repair_job, etc.
    entity_id = Column(Integer, nullable=False)
    actor = Column(String, nullable=False)  # SURVEYOR | ENGINEER | policy_engine | worker
    action = Column(String, nullable=False)  # create | promote | notice | close | override, etc.
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=True)
    at = Column(DateTime, default=datetime.datetime.utcnow)
    note = Column(Text, nullable=True)
