from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import User
from ..schemas import ModelSettings, ModelSettingsUpdate, SettingsReadiness
from ..services.app_settings import masked, missing_model_settings, runtime_model_settings, set_value

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/models", response_model=ModelSettings)
def get_model_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    runtime = runtime_model_settings(db)
    return ModelSettings(
        paddle_ocr_job_url=runtime.paddle_ocr_job_url,
        paddle_ocr_model=runtime.paddle_ocr_model,
        paddle_ocr_token_masked=masked(runtime.paddle_ocr_token),
        has_paddle_ocr_token=bool(runtime.paddle_ocr_token),
        llm_base_url=runtime.llm_base_url,
        llm_model=runtime.llm_model,
        llm_api_key_masked=masked(runtime.llm_api_key),
        has_llm_api_key=bool(runtime.llm_api_key),
    )


@router.put("/models", response_model=ModelSettings)
def update_model_settings(payload: ModelSettingsUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = payload.model_dump()
    for key in ("paddle_ocr_job_url", "paddle_ocr_model", "llm_base_url", "llm_model"):
        value = data.get(key)
        if value is not None:
            set_value(db, key, value)
    if data.get("clear_paddle_ocr_token"):
        set_value(db, "paddle_ocr_token", "")
    elif data.get("paddle_ocr_token"):
        set_value(db, "paddle_ocr_token", data["paddle_ocr_token"])
    if data.get("clear_llm_api_key"):
        set_value(db, "llm_api_key", "")
    elif data.get("llm_api_key"):
        set_value(db, "llm_api_key", data["llm_api_key"])
    db.commit()
    return get_model_settings(_, db)


@router.get("/readiness", response_model=SettingsReadiness)
def readiness(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    missing = missing_model_settings(db)
    return SettingsReadiness(ready=not missing, missing=missing)
