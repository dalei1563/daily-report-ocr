import json
from pathlib import Path
from typing import Any
from uuid import uuid4


def ensure_dirs(data_dir: str) -> dict[str, Path]:
    base = Path(data_dir)
    dirs = {
        "base": base,
        "uploads": base / "uploads",
        "ocr_raw": base / "ocr_raw",
        "exports": base / "exports",
    }
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)
    return dirs


def safe_json_loads(value: str, fallback: Any):
    try:
        return json.loads(value) if value else fallback
    except json.JSONDecodeError:
        return fallback


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def unique_name(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return f"{uuid4().hex}{suffix}"
