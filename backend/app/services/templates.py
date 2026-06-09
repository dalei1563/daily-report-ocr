import json

from sqlalchemy.orm import Session

from ..models import Template, TemplateField
from ..schemas import TemplateIn


def serialize_aliases(aliases: list[str]) -> str:
    return json.dumps(aliases, ensure_ascii=False)


def field_to_dict(field: TemplateField) -> dict:
    return {
        "id": field.id,
        "code": field.code,
        "name": field.name,
        "field_type": field.field_type,
        "area": field.area,
        "required": field.required,
        "aliases": json.loads(field.aliases or "[]"),
        "sort_order": field.sort_order,
    }


def template_to_dict(template: Template) -> dict:
    fields = sorted(template.fields, key=lambda item: item.sort_order)
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "is_default": template.is_default,
        "is_active": template.is_active,
        "fields": [field_to_dict(field) for field in fields],
    }


def apply_template_payload(db: Session, template: Template, payload: TemplateIn):
    if payload.is_default:
        db.query(Template).filter(Template.id != template.id).update({"is_default": False})
    template.name = payload.name
    template.description = payload.description
    template.is_default = payload.is_default
    template.is_active = payload.is_active
    template.fields.clear()
    for item in payload.fields:
        template.fields.append(
            TemplateField(
                code=item.code,
                name=item.name,
                field_type=item.field_type,
                area=item.area,
                required=item.required,
                aliases=serialize_aliases(item.aliases),
                sort_order=item.sort_order,
            )
        )
