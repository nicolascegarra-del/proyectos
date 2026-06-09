from pydantic_settings import BaseSettings
from functools import lru_cache

# Valores por defecto INSEGUROS: solo válidos para desarrollo local. Si alguno
# de estos sigue en uso cuando APP_ENV=production, el arranque debe abortar
# (ver validate_production_secrets). No reutilizar estas constantes como valores reales.
_DEFAULT_SECRET_KEY = "changeme-very-long-secret-key-please-change-in-production"
_DEFAULT_SUPERADMIN_PASSWORD = "changeme"


class Settings(BaseSettings):
    # Entorno de ejecución: development | staging | production.
    # En production se exige que los secretos no sean los defaults (fail-fast al arrancar).
    APP_ENV: str = "development"

    # Postgres nativo en el host. En Docker se sobreescribe vía env (host.docker.internal);
    # este default solo aplica al ejecutar el backend de forma nativa contra localhost.
    DATABASE_URL: str = "postgresql+asyncpg://klyp:klyp_local_dev_2026@localhost:5432/klyp"

    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    FERNET_KEY: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    APP_NAME: str = "Klyp"

    SUPERADMIN_EMAIL: str = "admin@klyp.app"
    SUPERADMIN_PASSWORD: str = _DEFAULT_SUPERADMIN_PASSWORD

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in ("production", "prod", "staging")


def validate_production_secrets(s: "Settings") -> None:
    """Aborta el arranque si en producción quedan secretos por defecto o vacíos.

    Evita que la app corra en producción con SECRET_KEY/FERNET_KEY/SUPERADMIN_PASSWORD
    inseguros de forma silenciosa. Solo se aplica cuando APP_ENV indica producción.
    """
    if not s.is_production:
        return

    problemas = []
    if not s.SECRET_KEY or s.SECRET_KEY == _DEFAULT_SECRET_KEY:
        problemas.append("SECRET_KEY usa el valor por defecto o está vacía")
    if not s.FERNET_KEY:
        problemas.append("FERNET_KEY no está configurada (cifrado SMTP no disponible)")
    if not s.SUPERADMIN_PASSWORD or s.SUPERADMIN_PASSWORD == _DEFAULT_SUPERADMIN_PASSWORD:
        problemas.append("SUPERADMIN_PASSWORD usa el valor por defecto 'changeme'")

    if problemas:
        detalle = "\n  - ".join(problemas)
        raise RuntimeError(
            f"Configuración insegura para APP_ENV={s.APP_ENV}. Define estos secretos "
            f"en las variables de entorno (Coolify) antes de arrancar:\n  - {detalle}"
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
