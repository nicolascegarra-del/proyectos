from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://klyp:klyp@db:5432/klyp"

    SECRET_KEY: str = "changeme-very-long-secret-key-please-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    FERNET_KEY: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    APP_NAME: str = "Klyp"

    SUPERADMIN_EMAIL: str = "admin@klyp.app"
    SUPERADMIN_PASSWORD: str = "changeme"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
