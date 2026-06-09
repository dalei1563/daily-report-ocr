from datetime import datetime
from pathlib import Path
import asyncio
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import OcrRecord, OcrResult, Template, User
from ..schemas import CorrectRequest, FlatRecordsOut, RecordDetailOut, RecordListOut
from ..services.audit import log_action
from ..services.app_settings import missing_model_settings, runtime_model_settings
from ..services.exporter import export_records
from ..services.llm import structure_markdown
from ..services.ocr import run_paddle_ocr
from ..services.templates import template_to_dict
from ..utils import ensure_dirs, json_dumps, safe_json_loads, unique_name

router = APIRouter(prefix="/records", tags=["records"])


def remove_empty_rows(data: dict) -> dict:
    cleaned = dict(data or {})
    rows = []
    for row in cleaned.get("rows") or []:
        if isinstance(row, dict) and any(str(value).strip() for value in row.values() if value is not None):
            rows.append(row)
    cleaned["rows"] = rows
    return cleaned


def can_access(record: OcrRecord, user: User) -> bool:
    return user.role == "admin" or record.created_by == user.id


def to_list(record: OcrRecord) -> RecordListOut:
    return RecordListOut(
        id=record.id,
        original_filename=record.original_filename,
        status=record.status,
        progress_step=record.progress_step,
        error_message=record.error_message,
        duration_ms=record.duration_ms,
        created_at=record.created_at,
        updated_at=record.updated_at,
        confirmed_at=record.confirmed_at,
        template_name=record.template.name,
        username=record.user.username,
    )


async def recognize_record_background(record_id: int, user_id: int):
    settings = get_settings()
    dirs = ensure_dirs(settings.data_dir)
    start = time.time()
    with SessionLocal() as db:
        runtime_settings = runtime_model_settings(db)
        record = db.query(OcrRecord).options(selectinload(OcrRecord.template).selectinload(Template.fields)).filter(OcrRecord.id == record_id).first()
        if not record:
            return
        try:
            record.status = "recognizing"
            record.progress_step = "submit"
            record.error_message = ""
            db.commit()

            record.progress_step = "running"
            db.commit()
            markdown, raw_ocr, raw_path = await run_paddle_ocr(runtime_settings, record.file_path, dirs["ocr_raw"])

            record.progress_step = "ocr_done"
            db.commit()

            record.progress_step = "ai"
            db.commit()
            structured, model_raw = await structure_markdown(runtime_settings, record.template, markdown)

            record.duration_ms = int((time.time() - start) * 1000)
            record.status = "needs_review"
            record.progress_step = "done"
            if record.result:
                result = record.result
            else:
                result = OcrResult(record_id=record.id)
                db.add(result)
            result.raw_markdown = markdown
            result.raw_ocr_json = raw_ocr
            result.model_raw_json = model_raw
            result.structured_json = json_dumps(structured)
            result.raw_path = raw_path
            log_action(db, user_id, "recognize_record", "record", record.id)
        except Exception as exc:
            record.status = "failed"
            record.progress_step = "failed"
            record.error_message = str(exc)
        db.commit()


@router.post("/upload")
async def upload_record(
    template_id: int | None = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    dirs = ensure_dirs(settings.data_dir)
    effective_template_id = user.bound_template_id or template_id
    if not effective_template_id:
        raise HTTPException(status_code=400, detail="请先绑定模板")
    template = db.get(Template, effective_template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=404, detail="Template not found")
    filename = unique_name(file.filename or "report.jpg")
    path = dirs["uploads"] / filename
    content = await file.read()
    path.write_bytes(content)
    record = OcrRecord(original_filename=file.filename or filename, file_path=str(path), template_id=effective_template_id, created_by=user.id)
    db.add(record)
    db.flush()
    log_action(db, user.id, "upload_record", "record", record.id)
    db.commit()
    return {"id": record.id}


@router.post("/{record_id}/recognize")
async def recognize(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(OcrRecord).options(selectinload(OcrRecord.template).selectinload(Template.fields)).filter(OcrRecord.id == record_id).first()
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    missing = missing_model_settings(db)
    if missing:
        raise HTTPException(status_code=400, detail=f"识别配置缺失：{','.join(missing)}")
    record.status = "recognizing"
    record.progress_step = "submit"
    record.error_message = ""
    db.commit()
    asyncio.create_task(recognize_record_background(record.id, user.id))
    return {"status": record.status, "progress_step": record.progress_step, "error_message": record.error_message}


@router.get("/{record_id}/progress")
def progress(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.get(OcrRecord, record_id)
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"id": record.id, "status": record.status, "progress_step": record.progress_step, "error_message": record.error_message}


@router.get("", response_model=list[RecordListOut])
def list_records(
    status: str | None = None,
    template_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(OcrRecord).options(selectinload(OcrRecord.template), selectinload(OcrRecord.user)).filter(OcrRecord.deleted == False)
    if user.role != "admin":
        query = query.filter(OcrRecord.created_by == user.id)
    if status:
        query = query.filter(OcrRecord.status == status)
    if template_id:
        query = query.filter(OcrRecord.template_id == template_id)
    return [to_list(item) for item in query.order_by(OcrRecord.created_at.desc()).all()]


@router.get("/flat", response_model=FlatRecordsOut)
def flat_records(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(OcrRecord).options(
        selectinload(OcrRecord.template).selectinload(Template.fields),
        selectinload(OcrRecord.user),
        selectinload(OcrRecord.result),
    ).filter(OcrRecord.deleted == False, OcrRecord.status == "confirmed")
    if user.role != "admin":
        query = query.filter(OcrRecord.created_by == user.id)
    records = query.order_by(OcrRecord.created_at.desc()).all()

    field_map: dict[str, str] = {}
    rows: list[dict] = []
    for record in records:
        if not record.result:
            continue
        for field in sorted(record.template.fields, key=lambda item: item.sort_order):
            field_map[field.code] = field.name
        data = safe_json_loads(record.result.corrected_json or record.result.structured_json, {})
        header_data = data.get("header") or {}
        detail_rows = data.get("rows") or []
        if not detail_rows:
            detail_rows = [{}]
        for index, detail in enumerate(detail_rows, start=1):
            rows.append(
                {
                    "record_id": record.id,
                    "row_index": index,
                    "template_name": record.template.name,
                    "username": record.user.username,
                    "created_at": record.created_at.isoformat(),
                    "confirmed_at": record.confirmed_at.isoformat() if record.confirmed_at else "",
                    **header_data,
                    **detail,
                }
            )
    columns = [
        {"code": "record_id", "name": "记录ID"},
        {"code": "template_name", "name": "模板"},
        {"code": "username", "name": "录入人"},
        {"code": "created_at", "name": "录入时间"},
        {"code": "confirmed_at", "name": "入库时间"},
    ]
    columns.extend({"code": code, "name": name} for code, name in field_map.items())
    return FlatRecordsOut(columns=columns, rows=rows)


@router.get("/{record_id}", response_model=RecordDetailOut)
def get_record(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(OcrRecord).options(
        selectinload(OcrRecord.template).selectinload(Template.fields),
        selectinload(OcrRecord.user),
        selectinload(OcrRecord.result),
    ).filter(OcrRecord.id == record_id).first()
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    data = None
    markdown = ""
    warnings = []
    if record.result:
        data = safe_json_loads(record.result.corrected_json or record.result.structured_json, {})
        markdown = record.result.raw_markdown
        warnings = data.get("warnings") or []
    base = to_list(record).model_dump()
    return RecordDetailOut(**base, template=template_to_dict(record.template), file_url=f"/api/records/{record.id}/file", result=data, raw_markdown=markdown, warnings=warnings)


@router.get("/{record_id}/file")
def get_file(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.get(OcrRecord, record_id)
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return FileResponse(record.file_path)


@router.put("/{record_id}/correct")
def correct(record_id: int, payload: CorrectRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(OcrRecord).options(selectinload(OcrRecord.result)).filter(OcrRecord.id == record_id).first()
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not record.result:
        record.result = OcrResult(record_id=record.id)
    record.result.corrected_json = json_dumps(remove_empty_rows(payload.corrected))
    if payload.confirm:
        record.status = "confirmed"
        record.confirmed_at = datetime.utcnow()
    log_action(db, user.id, "correct_record", "record", record.id)
    db.commit()
    return {"ok": True}


@router.delete("/{record_id}")
def delete_record(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.get(OcrRecord, record_id)
    if not record or record.deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    if not can_access(record, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    record.deleted = True
    log_action(db, user.id, "delete_record", "record", record.id)
    db.commit()
    return {"ok": True}


@router.post("/export")
def export(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = get_settings()
    dirs = ensure_dirs(settings.data_dir)
    query = db.query(OcrRecord).options(selectinload(OcrRecord.template), selectinload(OcrRecord.result)).filter(OcrRecord.deleted == False)
    if user.role != "admin":
        query = query.filter(OcrRecord.created_by == user.id)
    path = export_records(db, query.order_by(OcrRecord.created_at.desc()).all(), dirs["exports"])
    log_action(db, user.id, "export_records", "record", None, str(path))
    db.commit()
    return FileResponse(path, filename=Path(path).name)
