from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    bound_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("templates.id"), nullable=True)
    bound_template: Mapped[Optional["Template"]] = relationship()


class Template(TimestampMixin, Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    fields: Mapped[list["TemplateField"]] = relationship(cascade="all, delete-orphan", back_populates="template")


class TemplateField(TimestampMixin, Base):
    __tablename__ = "template_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id"))
    code: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    field_type: Mapped[str] = mapped_column(String(20), default="text")
    area: Mapped[str] = mapped_column(String(20), default="table")
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    aliases: Mapped[str] = mapped_column(Text, default="[]")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    template: Mapped[Template] = relationship(back_populates="fields")


class OcrRecord(TimestampMixin, Base):
    __tablename__ = "ocr_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="uploaded")
    progress_step: Mapped[str] = mapped_column(String(30), default="uploaded")
    error_message: Mapped[str] = mapped_column(Text, default="")
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    template: Mapped[Template] = relationship()
    user: Mapped[User] = relationship()
    result: Mapped[Optional["OcrResult"]] = relationship(cascade="all, delete-orphan", back_populates="record")


class OcrResult(TimestampMixin, Base):
    __tablename__ = "ocr_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("ocr_records.id"), unique=True)
    raw_markdown: Mapped[str] = mapped_column(Text, default="")
    raw_ocr_json: Mapped[str] = mapped_column(Text, default="")
    model_raw_json: Mapped[str] = mapped_column(Text, default="")
    structured_json: Mapped[str] = mapped_column(Text, default="{}")
    corrected_json: Mapped[str] = mapped_column(Text, default="")
    raw_path: Mapped[str] = mapped_column(String(500), default="")
    record: Mapped[OcrRecord] = relationship(back_populates="result")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    target_type: Mapped[str] = mapped_column(String(80), default="")
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
