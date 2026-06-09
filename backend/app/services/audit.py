from sqlalchemy.orm import Session

from ..models import AuditLog


def log_action(db: Session, user_id: int | None, action: str, target_type: str = "", target_id: int | None = None, detail: str = ""):
    db.add(AuditLog(user_id=user_id, action=action, target_type=target_type, target_id=target_id, detail=detail))
