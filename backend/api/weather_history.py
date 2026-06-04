"""GET /api/weather/history, /api/weather/history/readings, /api/weather/live-score."""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models
from backend.database import get_db
from backend.services.climate.scoring_v2 import compute_risk_score_v2
from backend.services.climate.hne import calculate_hne
from backend.services.climate.hot_nights_tracker import (
    get_current_consecutive_hot_nights,
)
from backend.services.climate.wbt import calculate_wbt
from backend.services.risk_config_service import (
    RiskConfig,
    get_active_risk_config,
)
from backend.services.weather_queries import get_active_warnings_deduped
from backend.services.weather_orchestrator import WeatherOrchestrator, weather_orchestrator

router = APIRouter(tags=["weather"])


def _theoretical_max(cfg: RiskConfig) -> float:
    """Return the absolute maximum score this config can produce,
    capped at 30 per the published formula."""
    max_w = max((b.score for b in cfg.wbt_thresholds), default=0.0)
    max_h = max((b.score for b in cfg.hne_thresholds), default=0.0)
    max_v = cfg.vulnerability_config.bonus
    max_m = max(cfg.warning_multipliers.values(), default=1.0)
    raw = (max_w + max_h + max_v) * max_m
    return min(30.0, raw)


@router.get("/history")
async def get_weather_history(
    days: int = Query(7, ge=1, le=90),
    station: Optional[str] = None,
    beta_14day: Optional[str] = "false",
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(lambda: weather_orchestrator),
):
    """Return daily weather aggregates for the last N days per station.
    Includes peak temp, peak WBT, peak RH, composite risk score, and HNE.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = db.query(models.WeatherReading).filter(
        models.WeatherReading.recorded_at >= since
    )
    if station:
        query = query.filter(models.WeatherReading.station == station)
    readings = query.order_by(models.WeatherReading.recorded_at).all()

    if not readings:
        return {"history": [], "message": "No data available for the requested window."}

    buckets: Dict[Any, list] = {}
    for r in readings:
        key = (r.recorded_at.date().isoformat(), r.station)
        buckets.setdefault(key, []).append(r)

    results = []
    for (date_str, statn), group in buckets.items():
        temps = [r.temp_c for r in group if r.temp_c is not None]
        wbts = [r.wet_bulb_temp_c for r in group if r.wet_bulb_temp_c is not None]
        rhs = [r.humidity_pct for r in group if r.humidity_pct is not None]

        peak_temp = max(temps) if temps else None
        peak_wbt = max(wbts) if wbts else None
        peak_rh = max(rhs) if rhs else None
        avg_rh = round(sum(rhs) / len(rhs), 1) if rhs else None

        nightly_hne_val = next(
            (r.nightly_hne for r in group if r.nightly_hne is not None), None
        )
        if nightly_hne_val is not None:
            hne = nightly_hne_val
        else:
            temps_ordered = [
                r.temp_c
                for r in sorted(group, key=lambda x: x.recorded_at)
                if r.temp_c is not None
            ]
            hne = calculate_hne(temps_ordered) if len(temps_ordered) >= 3 else 0.0

        crs: Optional[Dict[str, Any]] = None
        persisted_score = next(
            (r.composite_risk_score for r in group if r.composite_risk_score is not None),
            None,
        )
        persisted_state = next(
            (r.risk_level for r in group if r.risk_level is not None), None
        )
        if persisted_score is not None:
            crs = {"value": persisted_score, "state": persisted_state or "Safe"}
        elif peak_wbt is not None:
            risk_cfg = get_active_risk_config(db)
            station_name = group[0].station if group else "Hong Kong Observatory"
            consecutive = get_current_consecutive_hot_nights(
                db, station_name, date_str
            )
            crs = compute_risk_score_v2(peak_wbt, consecutive, [], risk_cfg)

        results.append({
            "date": date_str,
            "station": statn,
            "peak_temp": peak_temp,
            "peak_wbt": peak_wbt,
            "peak_rh": peak_rh,
            "avg_rh": avg_rh,
            "hne": hne,
            "composite_risk_score": crs,
            "risk_level": crs["state"] if crs else "Safe",
        })

    results.sort(
        key=lambda x: (
            x["date"],
            -(x["composite_risk_score"]["value"] if x["composite_risk_score"] else 0),
        ),
        reverse=True,
    )

    beta_enabled = (beta_14day or "").lower() == "true"
    if beta_enabled and orchestrator._open_meteo_enabled:
        latest_fetch = db.query(func.max(models.WeatherForecastDay.fetched_at)).scalar()
        hko_forecast: List[Dict[str, Any]] = []
        if latest_fetch:
            hko_rows = (
                db.query(models.WeatherForecastDay)
                .filter(models.WeatherForecastDay.fetched_at >= latest_fetch)
                .order_by(models.WeatherForecastDay.forecast_day_index)
                .all()
            )
            hko_forecast = [
                {
                    "forecast_date": f.forecast_date,
                    "forecast_day_index": f.forecast_day_index,
                    "min_temp": f.min_temp,
                    "max_temp": f.max_temp,
                    "min_rh": f.min_rh,
                    "max_rh": f.max_rh,
                    "weather_desc": f.weather_desc,
                    "risk_level": f.risk_level,
                }
                for f in hko_rows
            ]
        extended_result = await orchestrator.get_extended_forecast(hko_forecast)
        return {
            "history": results,
            "days": days,
            "extended_forecast": extended_result.get("extended_forecast", []),
            "open_meteo_status": extended_result.get("open_meteo_status", "ok"),
            "open_meteo_message": extended_result.get("open_meteo_message"),
        }

    return {"history": results, "days": days}


@router.get("/history/readings")
def get_historical_readings(
    station: str = Query(..., min_length=1, description="Station name"),
    hours: int = Query(12, ge=1, le=72, description="Number of past hours to retrieve"),
    db: Session = Depends(get_db),
):
    """Return individual ``WeatherReading`` rows for a station over the last N hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    readings = (
        db.query(models.WeatherReading)
        .filter(
            models.WeatherReading.station == station,
            models.WeatherReading.recorded_at >= since,
            models.WeatherReading.wet_bulb_temp_c.isnot(None),
        )
        .order_by(models.WeatherReading.recorded_at)
        .all()
    )
    if not readings:
        return {
            "readings": [],
            "message": f"No readings for {station} in last {hours}h.",
        }

    return {
        "station": station,
        "hours": hours,
        "readings": [
            {
                "recorded_at": r.recorded_at.isoformat(),
                "station": r.station,
                "wet_bulb_temp_c": r.wet_bulb_temp_c,
                "temp_c": r.temp_c,
                "humidity_pct": r.humidity_pct,
                "composite_risk_score": r.composite_risk_score,
            }
            for r in readings
        ],
        "count": len(readings),
    }


@router.post("/live-score")
def get_live_score(
    station: str = Query(..., min_length=1, description="Station name"),
    db: Session = Depends(get_db),
):
    """Recompute the risk score on-the-fly for a given station using current
    live data (wet-bulb temperature, active warnings, and hot-night streak).
    """
    latest = (
        db.query(models.WeatherReading)
        .filter(models.WeatherReading.station == station)
        .order_by(models.WeatherReading.recorded_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No reading found for station '{station}'",
        )

    wbt = latest.wet_bulb_temp_c
    if wbt is None and latest.temp_c is not None:
        rh = latest.humidity_pct if latest.humidity_pct is not None else 70.0
        wbt = calculate_wbt(latest.temp_c, rh)
    if wbt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot compute risk score for station '{station}': no temperature data",
        )

    raw_cfg = get_active_risk_config(db)
    cfg = RiskConfig.model_validate(raw_cfg)
    warnings_list, warnings_active_labels = get_active_warnings_deduped(db)
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    consecutive = get_current_consecutive_hot_nights(db, station, today_hk)
    result = compute_risk_score_v2(wbt, consecutive, warnings_list, raw_cfg)

    return {
        "station": station,
        "value": result["value"],
        "state": result["state"],
        "w": result["w"],
        "h": result["h"],
        "v": result["v"],
        "m": result["m"],
        "t8_applied": result["t8_applied"],
        "breakdown": result["breakdown"],
        "theoretical_max": _theoretical_max(cfg),
        "warnings_active": warnings_active_labels,
        "hot_nights_consecutive": consecutive,
        "wet_bulb_temp_c": wbt,
        "recorded_at": latest.recorded_at.isoformat(),
    }
