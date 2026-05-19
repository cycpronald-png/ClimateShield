"""
Health check service for ClimateShield backend.

Checks database connectivity, HKO API reachability, and disk space.
Returns structured results for the /health endpoint.
"""
import os
import shutil
import logging
from typing import Dict, Any
from sqlalchemy import text
from backend.database import engine
from backend.services.hko_client import hko

logger = logging.getLogger(__name__)

# Disk check path: configurable for local dev vs Docker
DISK_CHECK_PATH = os.getenv("DISK_CHECK_PATH", "/app")


async def check_database() -> Dict[str, Any]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "detail": "connected"}
    except Exception as e:
        logger.warning("Health check: database failed: %s", e)
        return {"status": "error", "detail": "database connection failed"}


async def check_hko() -> Dict[str, Any]:
    try:
        if not hko.is_ready:
            return {"status": "error", "detail": "client not initialized"}
        # Lightweight check: hit a known stable endpoint
        response = await hko._client.get(
            "/weatherAPI/opendata/weather.php",
            params={"dataType": "rhrread", "lang": "en"},
        )
        if response.status_code == 200:
            return {"status": "ok", "detail": "reachable"}
        return {"status": "error", "detail": f"HTTP {response.status_code}"}
    except Exception as e:
        logger.warning("Health check: HKO failed: %s", e)
        return {"status": "error", "detail": "hko api unreachable"}


async def check_disk() -> Dict[str, Any]:
    try:
        usage = shutil.disk_usage(DISK_CHECK_PATH)
        free_gb = usage.free / (1024 ** 3)
        total_gb = usage.total / (1024 ** 3)
        pct_free = (usage.free / usage.total) * 100
        status = "ok" if pct_free > 10 else "warning" if pct_free > 5 else "error"
        return {
            "status": status,
            "detail": f"{free_gb:.1f}GB free / {total_gb:.1f}GB total ({pct_free:.1f}%)",
        }
    except Exception as e:
        logger.warning("Health check: disk failed: %s", e)
        return {"status": "error", "detail": "disk check failed"}


async def run_health_checks() -> Dict[str, Any]:
    db = await check_database()
    hko_result = await check_hko()
    disk = await check_disk()

    healthy = all(
        r["status"] == "ok"
        for r in (db, hko_result, disk)
    )

    return {
        "status": "healthy" if healthy else "degraded",
        "checks": {
            "database": db,
            "hko": hko_result,
            "disk": disk,
        },
    }
