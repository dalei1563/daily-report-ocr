from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    paddle_ocr_token: str = ""
    paddle_ocr_job_url: str = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
    paddle_ocr_model: str = "PaddleOCR-VL-1.6"
    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    app_secret_key: str = "change-me"
    database_url: str = "sqlite:///./app.db"
    data_dir: str = "./data"
    backend_cors_origins: str = "http://localhost:5173,http://localhost:8080"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> List[str]:
        return [item.strip() for item in self.backend_cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
