from typing import Optional
from sqlalchemy.orm import Session
import logging
from ..schemas.audit_log import AuditLog

logger = logging.getLogger(__name__)

def record_audit(
    db: Session,
    entity: str,
    entity_id: int,
    actor: str,
    action: str,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    note: Optional[str] = None
) -> AuditLog:
    """
    Inserts an immutable audit log record for state transitions and key actions.
    
    :param db: SQLAlchemy Session
    :param entity: Name of entity ('defect', 'report', 'tender', 'repair_job', etc.)
    :param entity_id: Primary key ID of the entity
    :param actor: Actor triggering the action ('SURVEYOR', 'ENGINEER', 'policy_engine', etc.)
    :param action: Action performed ('create', 'promote', 'notice', 'close', 'override', etc.)
    :param from_status: Previous status/state
    :param to_status: New status/state
    :param note: Optional descriptive explanation or policy rationale
    :return: Created AuditLog instance
    """
    audit_entry = AuditLog(
        entity=entity,
        entity_id=entity_id,
        actor=actor or "SURVEYOR",
        action=action,
        from_status=from_status,
        to_status=to_status,
        note=note
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    logger.info(
        f"[AUDIT] entity={entity}:{entity_id} actor={actor} action={action} "
        f"transition={from_status}->{to_status} note={note}"
    )
    return audit_entry
