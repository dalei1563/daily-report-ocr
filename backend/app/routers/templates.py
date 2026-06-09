from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import Template, User
from ..schemas import TemplateIn
from ..services.audit import log_action
from ..services.templates import apply_template_payload, template_to_dict

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("")
def list_templates(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Template).options(selectinload(Template.fields)).filter(Template.is_active == True).order_by(Template.is_default.desc(), Template.id).all()
    return [template_to_dict(item) for item in items]


@router.post("")
def create_template(payload: TemplateIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    template = Template()
    db.add(template)
    apply_template_payload(db, template, payload)
    db.flush()
    log_action(db, admin.id, "create_template", "template", template.id)
    db.commit()
    db.refresh(template)
    return template_to_dict(template)


@router.put("/{template_id}")
def update_template(template_id: int, payload: TemplateIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    template = db.query(Template).options(selectinload(Template.fields)).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    apply_template_payload(db, template, payload)
    log_action(db, admin.id, "update_template", "template", template.id)
    db.commit()
    db.refresh(template)
    return template_to_dict(template)


@router.delete("/{template_id}")
def delete_template(template_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_active = False
    log_action(db, admin.id, "delete_template", "template", template.id)
    db.commit()
    return {"ok": True}
