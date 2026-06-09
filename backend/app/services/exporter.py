from pathlib import Path

from openpyxl import Workbook
from sqlalchemy.orm import Session

from ..models import OcrRecord, User
from ..utils import safe_json_loads


def export_records(db: Session, records: list[OcrRecord], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "OCR明细"
    headers = ["记录ID", "模板", "上传人", "状态", "上传时间", "确认时间"]
    dynamic_headers: list[str] = []
    rows_out: list[dict] = []
    for record in records:
        data = safe_json_loads(record.result.corrected_json if record.result and record.result.corrected_json else record.result.structured_json if record.result else "{}", {})
        header_data = data.get("header") or {}
        for key in header_data:
            if key not in dynamic_headers:
                dynamic_headers.append(key)
        for row in data.get("rows") or [{}]:
            for key in row:
                if key not in dynamic_headers:
                    dynamic_headers.append(key)
            rows_out.append({"record": record, "header": header_data, "row": row})
    ws.append(headers + dynamic_headers)
    for item in rows_out:
        record = item["record"]
        user = db.get(User, record.created_by)
        base = [
            record.id,
            record.template.name,
            user.username if user else "",
            record.status,
            record.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            record.confirmed_at.strftime("%Y-%m-%d %H:%M:%S") if record.confirmed_at else "",
        ]
        dynamic = [item["row"].get(k, item["header"].get(k, "")) for k in dynamic_headers]
        ws.append(base + dynamic)
    path = out_dir / "ocr_export.xlsx"
    wb.save(path)
    return path
