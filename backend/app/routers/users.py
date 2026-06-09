from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import Template, User
from ..schemas import BindTemplateRequest, UserCreate, UserOut, UserUpdate
from ..security import hash_password
from ..services.audit import log_action

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserOut)
def create_user(payload: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    if payload.bound_template_id and not db.get(Template, payload.bound_template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    user = User(
        username=payload.username,
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
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.role:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.bound_template_id is not None:
        if payload.bound_template_id and not db.get(Template, payload.bound_template_id):
            raise HTTPException(status_code=404, detail="Template not found")
        user.bound_template_id = payload.bound_template_id
    log_action(db, admin.id, "update_user", "user", user.id)
    db.commit()
    db.refresh(user)
    return user


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
