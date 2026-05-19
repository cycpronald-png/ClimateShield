from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Header, status
from sqlalchemy.orm import Session
from typing import List
import os
import json
import io
import secrets
from datetime import datetime
from fastapi.responses import StreamingResponse
from backend import crud, schemas, database, auth
from backend.services.counters import get_all_counters
from backend.services.audit_logger import audit_log
from backend.models import (
    WeatherReading,
    WeatherForecastDay,
    WeatherWarning,
    SystemAlert,
    GenerationCounter,
)

router = APIRouter(
    prefix="/api/admin", tags=["admin"]
)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


def _check_admin_password(provided: str) -> bool:
    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD environment variable is required")
    return secrets.compare_digest(provided.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8"))


@router.get("/export")
def export_backup(request: Request, db: Session = Depends(database.get_db)):
    """Export all weather data, alerts, and counters as JSON."""
    data = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0",
        "weather_readings": [
            {
                "id": r.id,
                "station": r.station,
                "district": r.district,
                "temp_c": r.temp_c,
                "humidity_pct": r.humidity_pct,
                "rainfall_mm": r.rainfall_mm,
                "wind_kmh": r.wind_kmh,
                "wind_direction": r.wind_direction,
                "uv_index": r.uv_index,
                "wet_bulb_temp_c": r.wet_bulb_temp_c,
                "hne": r.hne,
                "nightly_hne": r.nightly_hne,
                "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            }
            for r in db.query(WeatherReading).all()
        ],
        "weather_forecasts": [
            {
                "id": f.id,
                "forecast_date": f.forecast_date,
                "forecast_day_index": f.forecast_day_index,
                "min_temp": f.min_temp,
                "max_temp": f.max_temp,
                "min_rh": f.min_rh,
                "max_rh": f.max_rh,
                "weather_desc": f.weather_desc,
                "risk_level": f.risk_level,
                "wind": f.wind,
                "psr": f.psr,
                "icon_code": f.icon_code,
                "composite_risk_score": f.composite_risk_score,
                "wet_bulb_peak": f.wet_bulb_peak,
                "fetched_at": f.fetched_at.isoformat() if f.fetched_at else None,
            }
            for f in db.query(WeatherForecastDay).all()
        ],
        "weather_warnings": [
            {
                "id": w.id,
                "warning_type": w.warning_type,
                "signal": w.signal,
                "description": w.description,
                "issue_time": w.issue_time.isoformat() if w.issue_time else None,
                "update_time": w.update_time.isoformat() if w.update_time else None,
                "status": w.status,
                "fetched_at": w.fetched_at.isoformat() if w.fetched_at else None,
            }
            for w in db.query(WeatherWarning).all()
        ],
        "system_alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "title": a.title,
                "message": a.message,
                "district": a.district,
                "risk_level": a.risk_level,
                "status": a.status,
                "target_group": a.target_group,
                "source_data": a.source_data,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
            }
            for a in db.query(SystemAlert).all()
        ],
        "generation_counters": [
            {
                "name": c.name,
                "total": c.total,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in db.query(GenerationCounter).all()
        ],
    }

    buffer = io.StringIO()
    json.dump(data, buffer, indent=2, default=str)
    buffer.seek(0)

    filename = f"climateshield_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    ip = request.client.host if request.client else "unknown"
    audit_log(action="export_backup", ip=ip, details=f"exported backup {filename}")
    return StreamingResponse(
        io.BytesIO(buffer.getvalue().encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import")
def import_backup(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    """Import weather data, alerts, and counters from a JSON backup file."""
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a JSON file")

    MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MiB
    contents = b""
    try:
        while True:
            chunk = file.file.read(64_000)
            if not chunk:
                break
            contents += chunk
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Upload too large (max 50 MB)")
    finally:
        file.file.close()

    try:
        data = json.loads(contents.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid backup format")
    if "version" not in data:
        raise HTTPException(status_code=400, detail="Missing 'version' field")

    counts = {
        "weather_readings": 0,
        "weather_forecasts": 0,
        "weather_warnings": 0,
        "system_alerts": 0,
        "generation_counters": 0,
    }

    try:
        for item in data.get("weather_readings", []):
            reading = WeatherReading(
                station=item.get("station"),
                district=item.get("district"),
                temp_c=item.get("temp_c"),
                humidity_pct=item.get("humidity_pct"),
                rainfall_mm=item.get("rainfall_mm"),
                wind_kmh=item.get("wind_kmh"),
                wind_direction=item.get("wind_direction"),
                uv_index=item.get("uv_index"),
                wet_bulb_temp_c=item.get("wet_bulb_temp_c"),
                hne=item.get("hne"),
                nightly_hne=item.get("nightly_hne"),
            )
            db.add(reading)
            counts["weather_readings"] += 1

        for item in data.get("weather_forecasts", []):
            forecast = WeatherForecastDay(
                forecast_date=item.get("forecast_date"),
                forecast_day_index=item.get("forecast_day_index"),
                min_temp=item.get("min_temp"),
                max_temp=item.get("max_temp"),
                min_rh=item.get("min_rh"),
                max_rh=item.get("max_rh"),
                weather_desc=item.get("weather_desc"),
                risk_level=item.get("risk_level"),
                wind=item.get("wind"),
                psr=item.get("psr"),
                icon_code=item.get("icon_code"),
                composite_risk_score=item.get("composite_risk_score"),
                wet_bulb_peak=item.get("wet_bulb_peak"),
            )
            db.add(forecast)
            counts["weather_forecasts"] += 1

        for item in data.get("weather_warnings", []):
            warning = WeatherWarning(
                warning_type=item.get("warning_type"),
                signal=item.get("signal"),
                description=item.get("description"),
                status=item.get("status"),
            )
            db.add(warning)
            counts["weather_warnings"] += 1

        for item in data.get("system_alerts", []):
            alert = SystemAlert(
                alert_type=item.get("alert_type"),
                title=item.get("title"),
                message=item.get("message"),
                district=item.get("district"),
                risk_level=item.get("risk_level"),
                status=item.get("status"),
                target_group=item.get("target_group"),
                source_data=item.get("source_data"),
            )
            db.add(alert)
            counts["system_alerts"] += 1

        for item in data.get("generation_counters", []):
            counter = GenerationCounter(
                name=item.get("name"),
                total=item.get("total", 0),
            )
            db.add(counter)
            counts["generation_counters"] += 1

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {e}")

    ip = request.client.host if request.client else "unknown"
    audit_log(action="import_backup", ip=ip, details=f"imported backup {file.filename} with counts {counts}")
    return {
        "status": "success",
        "imported": counts,
    }


@router.get("/donations", response_model=List[schemas.DonationPledgeResponse])
def get_donations(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
):
    """
    Get all donation pledges.
    Requires Admin API Key.
    """
    pledges = crud.get_pledges(db, skip=skip, limit=limit)
    ip = request.client.host if request.client else "unknown"
    audit_log(action="view_donations", ip=ip, details=f"retrieved {len(pledges)} pledges")
    return pledges


@router.get("/donations/{pledge_id}", response_model=schemas.DonationPledgeResponse)
def get_donation(pledge_id: int, db: Session = Depends(database.get_db)):
    """
    Get a specific donation pledge by ID.
    Requires Admin API Key.
    """
    pledge = crud.get_pledge(db, pledge_id=pledge_id)
    if pledge is None:
        raise HTTPException(status_code=404, detail="Pledge not found")
    return pledge

# ============================================================
# Risk Formula Configuration Endpoints
# ============================================================

from typing import Any, Dict
from pydantic import BaseModel
from backend.services.risk_config_service import (
    get_active_risk_config,
    validate_risk_config,
    upsert_risk_config,
    reset_risk_config,
)


class RiskConfigUpdateRequest(BaseModel):
    password: str
    config: Dict[str, Any]


class RiskConfigPasswordRequest(BaseModel):
    password: str


@router.get("/risk-config")
def get_risk_config(
    db: Session = Depends(database.get_db),
    x_admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """
    Return the currently active risk formula configuration.
    Requires admin password in the X-Admin-Password header.
    """
    if not _check_admin_password(x_admin_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin password",
        )
    config = get_active_risk_config(db)
    return config


@router.put("/risk-config")
def update_risk_config(
    request: Request,
    req: RiskConfigUpdateRequest,
    db: Session = Depends(database.get_db),
):
    """
    Update the risk formula configuration after validating it.
    Requires admin password.
    """
    if not _check_admin_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin password",
        )
    try:
        upsert_risk_config(db, req.config)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid configuration: {e}",
        )
    ip = request.client.host if request.client else "unknown"
    audit_log(action="update_risk_config", ip=ip, details="risk formula updated by admin")
    return {"success": True, "message": "Risk formula configuration updated"}


@router.post("/risk-config/reset")
def reset_risk_config_endpoint(
    request: Request,
    req: RiskConfigPasswordRequest,
    db: Session = Depends(database.get_db),
):
    """
    Reset the risk formula configuration to the built-in default
    (from Update_For.md). Requires admin password.
    """
    if not _check_admin_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin password",
        )
    reset_risk_config(db)
    ip = request.client.host if request.client else "unknown"
    audit_log(action="reset_risk_config", ip=ip, details="risk formula reverted to default")
    return {"success": True, "message": "Risk formula configuration reset to default"}


@router.post("/risk-config/test")
def test_risk_config(
    req: RiskConfigUpdateRequest,
    db: Session = Depends(database.get_db),
):
    """
    Test a risk formula configuration without saving it.
    Returns the computed score and state for sample inputs.
    Requires admin password.
    """
    if not _check_admin_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin password",
        )
    try:
        validate_risk_config(req.config)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid configuration: {e}",
        )
    from backend.services.climate.scoring_v2 import compute_risk_score_v2
    # Run test scenarios
    scenarios = [
        {"wbt": 28.0, "consecutive": 1, "warnings": [], "label": "Moderate heat, no warning"},
        {"wbt": 31.0, "consecutive": 5, "warnings": [{"warning_type": "Strong Wind Signal No. 3", "signal": "T3"}], "label": "Extreme heat + T3"},
        {"wbt": 29.0, "consecutive": 2, "warnings": [{"warning_type": "Gale or Storm Signal No. 8", "signal": "T8"}], "label": "T8 floor rule"},
    ]
    results = []
    for s in scenarios:
        result = compute_risk_score_v2(s["wbt"], s["consecutive"], s["warnings"], req.config)
        results.append({
            "label": s["label"],
            "inputs": {"wbt": s["wbt"], "consecutive": s["consecutive"], "warnings": s["warnings"]},
            "score": result["value"],
            "state": result["state"],
            "breakdown": result.get("breakdown", ""),
        })
    return {"valid": True, "scenarios": results}
