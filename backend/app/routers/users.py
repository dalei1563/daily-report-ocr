from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import OcrRecord, Template, User
from ..schemas import BindTemplateRequest, UserCreate, UserOut, UserPasswordReset, UserStatusUpdate, UserUpdate
from ..security import hash_password
from ..services.audit import log_action

router = APIRouter(prefix="/users", tags=["users"])


def active_admin_count(db: Session) -> int:
    return db.query(User).filter(User.role == "admin", User.is_active == True, User.deleted == False).count()


def get_managed_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id, User.deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def validate_role(role: str) -> None:
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Invalid role")


def ensure_template_exists(db: Session, template_id: int | None) -> None:
    if template_id and not db.get(Template, template_id):
        raise HTTPException(status_code=404, detail="Template not found")


def ensure_admin_can_reduce_user(admin: User, target: User, db: Session, action: str) -> None:
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail=f"Cannot {action} your own account")
    if target.role == "admin" and target.is_active and active_admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last active admin")


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).filter(User.deleted == False).order_by(User.id).all()


@router.post("", response_model=UserOut)
def create_user(payload: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    validate_role(payload.role)
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    ensure_template_exists(db, payload.bound_template_id)
    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        bound_template_id=payload.bound_template_id,
    )
    db.add(user)
    db.flush()
    log_action(db, admin.id, "create_user", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = get_managed_user(db, user_id)
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.role:
        validate_role(payload.role)
        if user.id == admin.id and payload.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot change your own admin role")
        if user.role == "admin" and payload.role != "admin":
            ensure_admin_can_reduce_user(admin, user, db, "demote")
        user.role = payload.role
    if payload.is_active is not None:
        if not payload.is_active:
            ensure_admin_can_reduce_user(admin, user, db, "disable")
        user.is_active = payload.is_active
    if payload.bound_template_id is not None:
        ensure_template_exists(db, payload.bound_template_id)
        user.bound_template_id = payload.bound_template_id
    log_action(db, admin.id, "update_user", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserOut)
def update_user_status(user_id: int, payload: UserStatusUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = get_managed_user(db, user_id)
    if not payload.is_active:
        ensure_admin_can_reduce_user(admin, user, db, "disable")
    user.is_active = payload.is_active
    log_action(db, admin.id, "enable_user" if payload.is_active else "disable_user", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserOut)
def reset_user_password(user_id: int, payload: UserPasswordReset, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = get_managed_user(db, user_id)
    user.password_hash = hash_password(payload.password)
    log_action(db, admin.id, "reset_user_password", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = get_managed_user(db, user_id)
    ensure_admin_can_reduce_user(admin, user, db, "delete")
    has_records = db.query(OcrRecord.id).filter(OcrRecord.created_by == user.id).first() is not None
    log_action(db, admin.id, "delete_user", "user", user.id, "soft" if has_records else "hard")
    if has_records:
        user.is_active = False
        user.deleted = True
    else:
        db.delete(user)
    db.commit()
    return {"ok": True}


@router.put("/me/template", response_model=UserOut)
def bind_my_template(payload: BindTemplateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    template = db.get(Template, payload.template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=404, detail="Template not found")
    user.bound_template_id = template.id
    log_action(db, user.id, "bind_template", "template", template.id)
    db.commit()
    db.refresh(user)
    return user
