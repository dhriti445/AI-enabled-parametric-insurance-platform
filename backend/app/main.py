from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_admin import router as admin_router
from app.api.routes_auth import router as auth_router
from app.api.routes_claims import router as claims_router
from app.api.routes_subscription import router as subscription_router
from app.api.routes_triggers import router as triggers_router
from app.core.config import settings
from app.core.database import Base, engine

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/")
def health() -> dict:
    return {"status": "ok", "service": settings.app_name}


app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(subscription_router, prefix=settings.api_prefix)
app.include_router(triggers_router, prefix=settings.api_prefix)
app.include_router(claims_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)
