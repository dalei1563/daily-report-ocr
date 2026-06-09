from types import SimpleNamespace

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AppSetting

SETTING_KEYS = {
    "paddle_ocr_job_url",
    "paddle_ocr_model",
    "paddle_ocr_token",
    "llm_base_url",
    "llm_model",
    "llm_api_key",
}


def get_value(db: Session, key: str, default: str = "") -> str:
    item = db.get(AppSetting, key)
    return item.value if item else default


def set_value(db: Session, key: str, value: str):
    item = db.get(AppSetting, key)
    if not item:
        item = AppSetting(key=key, value=value)
        db.add(item)
    else:
        item.value = value


def seed_settings_from_env(db: Session):
    settings = get_settings()
    defaults = {
        "paddle_ocr_job_url": settings.paddle_ocr_job_url,
        "paddle_ocr_model": settings.paddle_ocr_model,
        "paddle_ocr_token": settings.paddle_ocr_token,
        "llm_base_url": settings.llm_base_url,
        "llm_model": settings.llm_model,
        "llm_api_key": settings.llm_api_key,
    }
    for key, value in defaults.items():
        if db.get(AppSetting, key) is None:
            set_value(db, key, value or "")


def runtime_model_settings(db: Session):
    settings = get_settings()
    return SimpleNamespace(
        paddle_ocr_job_url=get_value(db, "paddle_ocr_job_url", settings.paddle_ocr_job_url),
        paddle_ocr_model=get_value(db, "paddle_ocr_model", settings.paddle_ocr_model),
        paddle_ocr_token=get_value(db, "paddle_ocr_token", ""),
        llm_base_url=get_value(db, "llm_base_url", settings.llm_base_url),
        llm_model=get_value(db, "llm_model", settings.llm_model),
        llm_api_key=get_value(db, "llm_api_key", ""),
    )


def missing_model_settings(db: Session) -> list[str]:
    runtime = runtime_model_settings(db)
    missing = []
    if not runtime.paddle_ocr_token:
        missing.append("PaddleOCR密钥")
    if not runtime.llm_api_key:
        missing.append("大模型密钥")
    return missing


def masked(value: str) -> str:
    return "****" if value else ""
