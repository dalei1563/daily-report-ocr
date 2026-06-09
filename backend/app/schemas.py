from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    bound_template_id: Optional[int] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str = Field(min_length=6)
    role: str = "user"
    bound_template_id: Optional[int] = None


class UserUpdate(BaseModel):
    password: Optional[str] = Field(default=None, min_length=6)
    role: Optional[str] = None
    is_active: Optional[bool] = None
    bound_template_id: Optional[int] = None


class TemplateFieldIn(BaseModel):
    code: str
    name: str
    field_type: str = "text"
    area: str = "table"
    required: bool = False
    aliases: list[str] = []
    sort_order: int = 0


class TemplateFieldOut(TemplateFieldIn):
    id: int

    model_config = {"from_attributes": True}


class TemplateIn(BaseModel):
    name: str
    description: str = ""
    is_default: bool = False
    is_active: bool = True
    fields: list[TemplateFieldIn] = []


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str
    is_default: bool
    is_active: bool
    fields: list[TemplateFieldOut]

    model_config = {"from_attributes": True}


class RecordListOut(BaseModel):
    id: int
    original_filename: str
    status: str
    progress_step: str = "uploaded"
    error_message: str
    duration_ms: Optional[int]
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime]
    template_name: str
    username: str


class RecordDetailOut(RecordListOut):
    template: TemplateOut
    file_url: str
    result: dict[str, Any] | None
    raw_markdown: str = ""
    warnings: list[str] = []


class BindTemplateRequest(BaseModel):
    template_id: int


class FlatRecordsOut(BaseModel):
    columns: list[dict[str, str]]
    rows: list[dict[str, Any]]


class CorrectRequest(BaseModel):
    corrected: dict[str, Any]
    confirm: bool = True


class ModelSettings(BaseModel):
    paddle_ocr_job_url: str
    paddle_ocr_model: str
    paddle_ocr_token_masked: str
    has_paddle_ocr_token: bool
    llm_base_url: str
    llm_model: str
    llm_api_key_masked: str
    has_llm_api_key: bool


class ModelSettingsUpdate(BaseModel):
    paddle_ocr_job_url: Optional[str] = None
    paddle_ocr_model: Optional[str] = None
    paddle_ocr_token: Optional[str] = None
    clear_paddle_ocr_token: bool = False
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None
    clear_llm_api_key: bool = False


class SettingsReadiness(BaseModel):
    ready: bool
    missing: list[str]
