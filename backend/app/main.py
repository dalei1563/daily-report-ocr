from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Template, User
from .routers import auth, records, settings, templates, users
from .security import hash_password
from .services.app_settings import seed_settings_from_env
from .services.templates import apply_template_payload
from .schemas import TemplateIn, TemplateFieldIn
from .utils import ensure_dirs


def seed(db: Session):
    if not db.query(User).filter(User.username == "admin").first():
        db.add(User(username="admin", password_hash=hash_password("admin123"), role="admin"))
    if not db.query(Template).first():
        tpl = Template()
        db.add(tpl)
        apply_template_payload(
            db,
            tpl,
            TemplateIn(
                name="通用日报表",
                description="默认字段，可按实际报表调整",
                is_default=True,
                fields=[
                    TemplateFieldIn(code="company", name="公司", area="header", field_type="text", sort_order=1),
                    TemplateFieldIn(code="department", name="部门", area="header", field_type="text", sort_order=2),
                    TemplateFieldIn(code="date", name="日期", area="header", field_type="date", required=True, sort_order=3),
                    TemplateFieldIn(code="serial_number", name="序号", area="table", field_type="text", sort_order=10),
                    TemplateFieldIn(code="product_name", name="产品名称", area="table", field_type="text", required=True, sort_order=11),
                    TemplateFieldIn(code="actual_quantity", name="实际数量", area="table", field_type="number", sort_order=12),
                    TemplateFieldIn(code="operator", name="操作员", area="table", field_type="text", sort_order=13),
                ],
            ),
        )
    seed_settings_from_env(db)
    db.commit()


def migrate_sqlite():
    if not settings_obj.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        columns = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
        if "bound_template_id" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN bound_template_id INTEGER"))
        record_columns = [row[1] for row in conn.execute(text("PRAGMA table_info(ocr_records)")).fetchall()]
        if "progress_step" not in record_columns:
            conn.execute(text("ALTER TABLE ocr_records ADD COLUMN progress_step VARCHAR(30) DEFAULT 'uploaded'"))


settings_obj = get_settings()
ensure_dirs(settings_obj.data_dir)
Base.metadata.create_all(bind=engine)
migrate_sqlite()
with SessionLocal() as db:
    seed(db)

app = FastAPI(title="日报表 OCR 识别工具")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_obj.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(records.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
