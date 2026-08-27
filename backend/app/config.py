import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Get the path to the backend directory where .env is located
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

class Settings(BaseSettings):
    mongodb_connection_string: str = ""
    mongodb_db_name: str = ""
    jwt_secret: str = ""
    ml_service_url: str = ""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()