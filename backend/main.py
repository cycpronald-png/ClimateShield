import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from backend.services.hko_client import hko
from backend.services.open_meteo_client import open_meteo
from backend.services.weather_orchestrator import weather_orchestrator
from backend.services.scheduler import start_scheduler, shutdown_scheduler
from backend.database import Base, engine

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables if they don't exist (idempotent per Context7/FastAPI docs)
    Base.metadata.create_all(engine)
    logger.info("Database tables initialized/verified.")

    await hko.init()
    await open_meteo.init()
    weather_orchestrator.set_open_meteo_enabled(True)
    start_scheduler()
    logger.info("HKO client and Open-Meteo client initialized and scheduler started.")

    from backend.services.weather_orchestrator import seed_weather_data
    try:
        await seed_weather_data()
    except Exception:
        logger.exception("Seed failed (non-critical)")

    try:
        yield
    finally:
        logger.info("Graceful shutdown in progress")

        await hko.close()
        await open_meteo.close()
        shutdown_scheduler()
        logger.info("HKO client and Open-Meteo client closed and scheduler shut down.")

        engine.dispose()
        logger.info("Database engine disposed.")

        logger.info("Graceful shutdown complete.")

app = FastAPI(
    title="ClimateShield API",
    description="Climate risk intelligence, HKO weather integration, and donor management.",
    version="1.0.0",
    lifespan=lifespan,
)

# Load CORS origins from env (comma-separated) for production flexibility
_cors_env = os.getenv("CORS_ORIGINS", "")
if _cors_env.strip():
    origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    origins = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api import donor, admin, weather, health

app.include_router(donor.router)
app.include_router(admin.router)
app.include_router(weather.router)
app.include_router(health.router)

# Serve static files from dist directory (built frontend)
STATIC_DIR = os.getenv("STATIC_DIR", "/app/frontend/dist")

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str = ""):
        # API routes are already handled by routers above
        # Serve index.html for all other routes (SPA catch-all)
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"message": "ClimateShield API is running", "version": "1.0.0"}
else:
    @app.get("/")
    def read_root():
        return {"message": "ClimateShield API is running", "version": "1.0.0"}
