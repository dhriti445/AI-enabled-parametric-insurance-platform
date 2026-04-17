from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Parametric Insurance Platform"
    api_prefix: str = "/api"
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/parametric_insurance"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
