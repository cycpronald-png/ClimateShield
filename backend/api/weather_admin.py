"""GET/POST /api/weather/alerts/*, /api/weather/warnings, /api/weather/risk-config,
POST /api/weather/refresh, /api/weather/last-refresh, /api/weather/metrics*.
"""
import os
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.limiter import limiter
from backend.services.counters import get_all_counters, get_last_reset_at
from backend.services.last_refresh import _write_last_refresh, get_last_refresh
from backend.services.risk_config_service import get_active_risk_config

router = APIRouter(tags=["weather"])

METRICS_PASSWORD = os.getenv("METRICS_PASSWORD")
if not METRICS_PASSWORD:
    raise RuntimeError(
        "METRICS_PASSWORD environment variable is required. "
        "Set it before starting the application."
    )


def _check_password(provided: str) -> bool:
    return secrets.compare_digest(
        provided.encode("utf-8"), METRICS_PASSWORD.encode("utf-8")
    )


# --------------------------------------------------------------------------- #
# Warnings / refresh / last-refresh                                           #
# --------------------------------------------------------------------------- #

@router.get("/warnings")
def get_active_warnings(db: Session = Depends(get_db)):
    """Return current active HKO weather warnings."""
    warnings = (
        db.query(models.WeatherWarning)
        .filter(models.WeatherWarning.status == "active")
        .order_by(models.WeatherWarning.issue_time.desc())
        .all()
    )
    return warnings


@router.post("/refresh")
@limiter.limit("3/minute")
async def manual_refresh(request: Request, db: Session = Depends(get_db)):
    """Manually trigger an immediate HKO data fetch and persistence."""
    from backend.services.weather_orchestrator import persist_weather_data
    from backend.services.hko_client import hko
    from backend.services.counters import increment_counter

    raw = await hko.fetch_all(lang="en")
    increment_counter(db, "hko_fetches")
    summary = persist_weather_data(db, raw)
    db.commit()
    _write_last_refresh(success=True)
    total = summary.get("readings_persisted", 0) + summary.get(
        "forecast_days_persisted", 0
    )
    if total == 0:
        return {
            "success": True,
            "warning": "HKO returned no data. The external service may be temporarily unavailable or rate-limited.",
            "summary": summary,
        }
    return {"success": True, "summary": summary}


@router.get("/last-refresh")
def get_last_refresh_endpoint():
    """Return the timestamp and status of the last scheduled or manual refresh."""
    return get_last_refresh()


# --------------------------------------------------------------------------- #
# Alerts                                                                      #
# --------------------------------------------------------------------------- #

@router.get("/alerts/unread", response_model=List[schemas.SystemAlertResponse])
def get_unread_alerts(db: Session = Depends(get_db), limit: int = 50):
    """Return pending system alerts. Frontend polls this every 2 minutes."""
    return (
        db.query(models.SystemAlert)
        .filter(models.SystemAlert.status == "pending")
        .order_by(models.SystemAlert.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Acknowledge a system alert so it is not returned by ``/alerts/unread`` again."""
    alert = (
        db.query(models.SystemAlert)
        .filter(models.SystemAlert.id == alert_id)
        .first()
    )
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found"
        )
    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "alert_id": alert_id}


# --------------------------------------------------------------------------- #
# Metrics                                                                     #
# --------------------------------------------------------------------------- #

class _MetricsRequest(BaseModel):
    password: str = Field(..., min_length=1)


@router.post("/metrics")
@limiter.limit("30/minute")
def get_metrics(request: Request, db: Session = Depends(get_db)):
    """Return cumulative generation impact counters (public)."""
    return get_all_counters(db)


@router.post("/metrics/last-reset")
@limiter.limit("30/minute")
def get_last_reset(request: Request, db: Session = Depends(get_db)):
    """Return the timestamp of the most recent metrics reset (public)."""
    ts = get_last_reset_at(db)
    return {"last_reset_at": ts.isoformat() if ts else None}


@router.post("/verify-password")
@limiter.limit("5/minute")
def verify_password(request: Request, req: _MetricsRequest):
    """Verify the metrics/admin password without side effects."""
    if not _check_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid password",
        )
    return {"valid": True}


# --------------------------------------------------------------------------- #
# Public risk-config (read-only)                                             #
# --------------------------------------------------------------------------- #

@router.get("/risk-config")
def get_public_risk_config(db: Session = Depends(get_db)):
    """Return the active risk formula configuration (read-only)."""
    return get_active_risk_config(db)
