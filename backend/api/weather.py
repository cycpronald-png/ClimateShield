import os
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.limiter import limiter

from backend.database import get_db
from backend import models, schemas
from backend.services.counters import get_all_counters
from backend.services.last_refresh import _write_last_refresh, get_last_refresh
from backend.services.audit_logger import audit_log
from backend.services.open_meteo_client import open_meteo
from backend.services.weather_orchestrator import weather_orchestrator, WeatherOrchestrator

METRICS_PASSWORD = os.getenv("METRICS_PASSWORD")
if not METRICS_PASSWORD:
    raise RuntimeError(
        "METRICS_PASSWORD environment variable is required. "
        "Set it before starting the application."
    )

# Import new v2 scoring at module level
from backend.services.climate.scoring_v2 import compute_risk_score_v2
from backend.services.risk_config_service import get_active_risk_config
from backend.services.climate.hot_nights_tracker import get_current_consecutive_hot_nights
from backend.services.climate_engine import calculate_wbt, calculate_hne, compute_risk_outlook, is_extreme_hne

router = APIRouter(
    prefix="/api/weather",
    tags=["weather"],
)


def _check_password(provided: str) -> bool:
    return secrets.compare_digest(provided.encode("utf-8"), METRICS_PASSWORD.encode("utf-8"))


def get_orchestrator() -> WeatherOrchestrator:
    """FastAPI dependency that returns the shared WeatherOrchestrator singleton."""
    return weather_orchestrator


# ============================================================
# Public endpoints (no auth required for basic weather data)
# ============================================================

@router.get(
    "/current",
    response_model=List[schemas.WeatherReadingResponse],
    response_model_exclude_none=True,
)
def get_current_weather(db: Session = Depends(get_db)):
    """
    Return the most recent weather reading per station (last 2 hours).
    Recomputes composite_risk_score on-the-fly for readings where it is null.
    """
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    from sqlalchemy import func
    latest = (
        db.query(
            models.WeatherReading.station,
            func.max(models.WeatherReading.id).label("latest_id")
        )
        .filter(models.WeatherReading.recorded_at >= two_hours_ago)
        .group_by(models.WeatherReading.station)
        .subquery()
    )
    readings = (
        db.query(models.WeatherReading)
        .join(latest, models.WeatherReading.id == latest.c.latest_id)
        .order_by(models.WeatherReading.station)
        .all()
    )
    # On-the-fly CRS recomputation for null or stale-zero scores (WBT >= first threshold)
    risk_cfg = None
    today_hk = None
    for r in readings:
        crs_is_stale = (
            r.composite_risk_score is None
            or (r.composite_risk_score == 0.0 and r.wet_bulb_temp_c is not None)
        )
        if not crs_is_stale:
            continue
        wbt = r.wet_bulb_temp_c
        if wbt is None and r.temp_c is not None:
            rh = r.humidity_pct if r.humidity_pct is not None else 70.0
            wbt = calculate_wbt(r.temp_c, rh)
            r.wet_bulb_temp_c = wbt
            if r.humidity_pct is None:
                r.humidity_pct = rh
        if wbt is not None:
            if risk_cfg is None:
                risk_cfg = get_active_risk_config(db)
            if today_hk is None:
                today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
            consecutive = get_current_consecutive_hot_nights(db, r.station, today_hk)
            all_warnings = (
                db.query(models.WeatherWarning)
                .filter(models.WeatherWarning.status == "active")
                .all()
            )
            seen_types = set()
            warnings_list = []
            for w in all_warnings:
                if w.warning_type not in seen_types:
                    seen_types.add(w.warning_type)
                    warnings_list.append({"warning_type": w.warning_type, "signal": w.signal})
            crs = compute_risk_score_v2(wbt, consecutive, warnings_list, risk_cfg)
            r.composite_risk_score = crs["value"]
            r.risk_level = crs["state"]
    return readings


@router.get("/forecast", response_model=List[schemas.WeatherForecastDayBase])
async def get_forecast(
    beta_14day: bool = False,
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(get_orchestrator),
):
    """
    Return the latest 9-day forecast (one row per forecast_day_index).
    When beta_14day=true and Open-Meteo is enabled, include days 10-14.
    Always returns a list of plain dicts with consistent structure.
    """
    latest_fetch_subq = (
        db.query(
            models.WeatherForecastDay.forecast_day_index,
            func.max(models.WeatherForecastDay.fetched_at).label("latest_fetched_at"),
        )
        .group_by(models.WeatherForecastDay.forecast_day_index)
        .subquery()
    )
    forecasts = (
        db.query(models.WeatherForecastDay)
        .join(
            latest_fetch_subq,
            (
                models.WeatherForecastDay.forecast_day_index
                == latest_fetch_subq.c.forecast_day_index
            )
            & (
                models.WeatherForecastDay.fetched_at
                == latest_fetch_subq.c.latest_fetched_at
            ),
        )
        .order_by(models.WeatherForecastDay.forecast_day_index)
        .all()
    )

    # Normalize DB models to plain dicts with all fields the frontend expects
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
            "wind": f.wind,
            "psr": f.psr,
            "icon_code": f.icon_code,
            "composite_risk_score": f.composite_risk_score,
            "wet_bulb_peak": f.wet_bulb_peak,
            "source": "hko",
        }
        for f in forecasts
    ]

    # Include extended forecast days 10-14 when requested
    if beta_14day and orchestrator._open_meteo_enabled:
        extended_result = await orchestrator.get_extended_forecast(hko_forecast)
        extended = extended_result.get("extended_forecast", [])
        # Always return extended when beta is requested; it contains at least HKO days
        return extended if extended else hko_forecast

    return hko_forecast


@router.get("/risks")
def get_risk_outlook(db: Session = Depends(get_db)):
    """
    Computed 7-day and 9-day risk summaries from persisted forecast data.
    """
    from backend.services.climate_engine import compute_risk_outlook, is_extreme_hne
    from backend.services.weather_orchestrator import parse_hko_to_forecast

    # Query most recent nightly HNE for advisory context (always available)
    latest_nightly_hne = (
        db.query(models.WeatherReading.nightly_hne)
        .filter(models.WeatherReading.nightly_hne.isnot(None))
        .order_by(models.WeatherReading.recorded_at.desc())
        .first()
    )
    hne_value = latest_nightly_hne[0] if latest_nightly_hne else None

    forecasts = (
        db.query(models.WeatherForecastDay)
        .order_by(models.WeatherForecastDay.forecast_day_index)
        .all()
    )
    if not forecasts:
        return {
            "risk_7_day": None,
            "risk_9_day": None,
            "hne": hne_value,
            "message": "No forecast data available yet.",
        }

    forecast_dicts = [
        {
            "forecast_date": f.forecast_date,
            "forecast_day_index": f.forecast_day_index,
            "min_temp": f.min_temp,
            "max_temp": f.max_temp,
            "min_rh": f.min_rh,
            "max_rh": f.max_rh,
            "weather_desc": f.weather_desc,
            "risk_level": f.risk_level,
            "composite_risk_score": f.composite_risk_score,
            "wet_bulb_peak": f.wet_bulb_peak,
            "wind": f.wind,
            "psr": f.psr,
            "icon_code": f.icon_code,
        }
        for f in forecasts
    ]

    risk_7 = compute_risk_outlook(forecast_dicts, 7)
    risk_9 = compute_risk_outlook(forecast_dicts, 9)

    if hne_value is not None and is_extreme_hne(hne_value):
        hne_advisory = (
            f"Last night's HNE was {hne_value} — severe nighttime heat stress. "
            "Check indoor shelters."
        )
        risk_7.advisory = (risk_7.advisory or "") + " " + hne_advisory
        risk_9.advisory = (risk_9.advisory or "") + " " + hne_advisory

    def serialize(out):
        return {
            "outlook_days": out.outlook_days,
            "risk_level": out.risk_level,
            "avg_max_temp": out.avg_max_temp,
            "avg_min_temp": out.avg_min_temp,
            "avg_wet_bulb_temp": out.avg_wet_bulb_temp,
            "highest_wet_bulb_temp": out.highest_wet_bulb_temp,
            "highest_max_temp": out.highest_max_temp,
            "average_humidity": out.average_humidity,
            "advisory": out.advisory,
        }

    return {
        "risk_7_day": serialize(risk_7),
        "risk_9_day": serialize(risk_9),
        "hne": hne_value,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# Composite Risk Score + Daily Aggregates
# ============================================================

@router.get("/history")
async def get_weather_history(
    days: int = Query(7, ge=1, le=90),
    station: Optional[str] = None,
    beta_14day: Optional[str] = "false",
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(get_orchestrator),
):
    """
    Return daily weather aggregates for the last N days per station.
    Includes peak temp, peak WBT, peak RH, composite risk score, and HNE.

    When beta_14day=true, appends Open-Meteo days 10-14 to the forward forecast
    via the weather orchestrator.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = db.query(models.WeatherReading).filter(models.WeatherReading.recorded_at >= since)
    if station:
        query = query.filter(models.WeatherReading.station == station)
    readings = query.order_by(models.WeatherReading.recorded_at).all()

    if not readings:
        return {"history": [], "message": "No data available for the requested window."}

    # Group by (date, station)
    buckets = {}
    for r in readings:
        key = (r.recorded_at.date().isoformat(), r.station)
        if key not in buckets:
            buckets[key] = []
        buckets[key].append(r)

    results = []
    for (date_str, statn), group in buckets.items():
        temps = [r.temp_c for r in group if r.temp_c is not None]
        wbts = [r.wet_bulb_temp_c for r in group if r.wet_bulb_temp_c is not None]
        rhs = [r.humidity_pct for r in group if r.humidity_pct is not None]

        peak_temp = max(temps) if temps else None
        peak_wbt = max(wbts) if wbts else None
        peak_rh = max(rhs) if rhs else None
        avg_rh = round(sum(rhs) / len(rhs), 1) if rhs else None

        # Prefer official nightly_hne when available, fallback to on-the-fly
        nightly_hne_val = next(
            (r.nightly_hne for r in group if r.nightly_hne is not None),
            None
        )
        if nightly_hne_val is not None:
            hne = nightly_hne_val
        else:
            temps_ordered = [r.temp_c for r in sorted(group, key=lambda x: x.recorded_at) if r.temp_c is not None]
            hne = calculate_hne(temps_ordered) if len(temps_ordered) >= 3 else 0.0

        crs = None
        # Prefer persisted score to preserve historical integrity
        persisted_score = next(
            (r.composite_risk_score for r in group if r.composite_risk_score is not None),
            None
        )
        persisted_state = next(
            (r.risk_level for r in group if r.risk_level is not None),
            None
        )
        if persisted_score is not None:
            crs = {"value": persisted_score, "state": persisted_state or "Safe"}
        elif peak_wbt is not None:
            risk_cfg = get_active_risk_config(db)
            station_name = group[0].station if group else "Hong Kong Observatory"
            consecutive = get_current_consecutive_hot_nights(db, station_name, date_str)
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

    # Sort by date desc, then by composite score desc
    results.sort(key=lambda x: (x["date"], -(x["composite_risk_score"]["value"] if x["composite_risk_score"] else 0)), reverse=True)

    # Extend to 14 days if beta is enabled
    beta_enabled = beta_14day.lower() == "true" if beta_14day else False
    if beta_enabled and orchestrator._open_meteo_enabled:
        # Get latest HKO forecast as base
        latest_fetch = (
            db.query(func.max(models.WeatherForecastDay.fetched_at))
            .scalar()
        )
        hko_forecast = []
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
    """
    Return individual WeatherReading rows for a specific station over the last N hours.
    Used by the WBT time-series graph to render the historical line.
    """
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
        return {"readings": [], "message": f"No readings for {station} in last {hours}h."}

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
    """
    Recompute the risk score on-the-fly for a given station using current
    live data (wet-bulb temperature, active warnings, and hot-night streak).

    Returns the current score plus the theoretical maximum (30).
    """
    # 1. Fetch latest reading for this station
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
    # Recompute WBT if missing (fallback to 70% RH)
    wbt = latest.wet_bulb_temp_c
    if wbt is None and latest.temp_c is not None:
        rh = latest.humidity_pct if latest.humidity_pct is not None else 70.0
        wbt = calculate_wbt(latest.temp_c, rh)

    # 2. Load risk config
    risk_cfg = get_active_risk_config(db)

    # 3. Fetch active warnings (deduplicated by warning_type)
    all_warnings = (
        db.query(models.WeatherWarning)
        .filter(models.WeatherWarning.status == "active")
        .all()
    )
    # Deduplicate: keep only one entry per warning_type
    seen_types = set()
    warnings_list = []
    for w in all_warnings:
        if w.warning_type not in seen_types:
            seen_types.add(w.warning_type)
            warnings_list.append({"warning_type": w.warning_type, "signal": w.signal})
    warnings_active_labels = list(seen_types)

    # 4. Fetch current consecutive hot nights
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    consecutive = get_current_consecutive_hot_nights(db, station, today_hk)

    # 5. Compute live score
    if wbt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot compute risk score for station '{station}': no temperature data",
        )
    result = compute_risk_score_v2(
        wbt,
        consecutive,
        warnings_list,
        risk_cfg,
    )

    # 6. Theoretical maximum: W=6 + H=6 + V=5 = 17 * M=3.0 = 51 → capped at 30
    theoretical_max = 30.0

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
        "theoretical_max": theoretical_max,
        "warnings_active": warnings_active_labels,
        "hot_nights_consecutive": consecutive,
        "wet_bulb_temp_c": wbt,
        "recorded_at": latest.recorded_at.isoformat(),
    }


def _psr_to_prob(psr: Optional[str]) -> float:
    """Map HKO PSR (Probability of Significant Rain) label to 0-1 probability."""
    mapping = {"High": 0.8, "Medium High": 0.65, "Medium": 0.5, "Medium Low": 0.35, "Low": 0.15}
    return mapping.get(psr or "", 0.2)


def _active_typhoon_signal(db: Session) -> float:
    """Return 1.0 if a Signal 3+ typhoon warning is active, else 0.0."""
    active = (
        db.query(models.WeatherWarning)
        .filter(
            models.WeatherWarning.status == "active",
            models.WeatherWarning.warning_type.ilike("%tropical cyclone%"),
        )
        .first()
    )
    if active and active.signal:
        try:
            sig = int(active.signal.replace("Signal ", "").strip())
            return 1.0 if sig >= 3 else 0.0
        except (ValueError, AttributeError):
            return 0.0
    return 0.0


@router.get("/trends")
def get_weather_trends(db: Session = Depends(get_db)):
    """
    Return combined backward (last 7 days history) + forward (9-day forecast)
    data for the risk trend modal chart.
    """
    # Backward: last 7 days
    since = datetime.now(timezone.utc) - timedelta(days=7)
    history_readings = (
        db.query(models.WeatherReading)
        .filter(models.WeatherReading.recorded_at >= since)
        .order_by(models.WeatherReading.recorded_at)
        .all()
    )

    # Group by date
    hist_buckets = {}
    for r in history_readings:
        d = r.recorded_at.date().isoformat()
        hist_buckets.setdefault(d, []).append(r)

    backward = []
    for date_str in sorted(hist_buckets.keys()):
        group = hist_buckets[date_str]
        temps = [r.temp_c for r in group if r.temp_c is not None]
        wbts = [r.wet_bulb_temp_c for r in group if r.wet_bulb_temp_c is not None]
        rhs = [r.humidity_pct for r in group if r.humidity_pct is not None]

        peak_temp = max(temps) if temps else None
        peak_wbt = max(wbts) if wbts else None
        avg_rh = round(sum(rhs) / len(rhs), 1) if rhs else None
        nightly_hne_val = next(
            (r.nightly_hne for r in group if r.nightly_hne is not None),
            None
        )
        if nightly_hne_val is not None:
            hne = nightly_hne_val
        else:
            temps_ordered = [r.temp_c for r in sorted(group, key=lambda x: x.recorded_at) if r.temp_c is not None]
            hne = calculate_hne(temps_ordered) if len(temps_ordered) >= 3 else 0.0

        crs = None
        # Prefer persisted score to preserve historical integrity
        persisted_score = next(
            (r.composite_risk_score for r in group if r.composite_risk_score is not None),
            None
        )
        persisted_state = next(
            (r.risk_level for r in group if r.risk_level is not None),
            None
        )
        if persisted_score is not None:
            crs = {"value": persisted_score, "state": persisted_state or "Safe"}
        elif peak_wbt is not None:
            risk_cfg = get_active_risk_config(db)
            station_name = group[0].station if group else None
            consecutive = get_current_consecutive_hot_nights(db, station_name, date_str)
            crs = compute_risk_score_v2(peak_wbt, consecutive, [], risk_cfg)

        backward.append({
            "date": date_str,
            "type": "history",
            "composite_risk_score": crs["value"] if crs else 0.0,
            "risk_level": crs["state"] if crs else "Safe",
            "wbt": peak_wbt,
            "hne": hne,
        })

    # Forward: 9-day forecast — one row per forecast_day_index from the latest HKO fetch
    latest_fetch_subq = (
        db.query(
            models.WeatherForecastDay.forecast_day_index,
            func.max(models.WeatherForecastDay.fetched_at).label("latest_fetched_at"),
        )
        .group_by(models.WeatherForecastDay.forecast_day_index)
        .subquery()
    )
    latest_fetch = db.query(func.max(models.WeatherForecastDay.fetched_at)).scalar()
    forecast_rows = (
        db.query(models.WeatherForecastDay)
        .join(
            latest_fetch_subq,
            (
                models.WeatherForecastDay.forecast_day_index
                == latest_fetch_subq.c.forecast_day_index
            )
            & (
                models.WeatherForecastDay.fetched_at
                == latest_fetch_subq.c.latest_fetched_at
            ),
        )
        .order_by(models.WeatherForecastDay.forecast_day_index)
        .all()
    )

    forward = []
    # Get current hot night streak for projection
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    current_streak = get_current_consecutive_hot_nights(
        db, "Hong Kong Observatory", today_hk
    )
    for f in forecast_rows:
        if f.max_temp is None:
            forward.append({
                "date": f.forecast_date,
                "type": "forecast",
                "composite_risk_score": None,
                "risk_level": None,
                "wbt": None,
                "hne": None,
            })
            continue
        max_rh_fb = f.max_rh if f.max_rh is not None else 70
        min_rh_fb = f.min_rh if f.min_rh is not None else 70
        wbt = calculate_wbt(f.max_temp, (max_rh_fb + min_rh_fb) / 2)
        crs = None
        if wbt is not None:
            risk_cfg = get_active_risk_config(db)
            # Temperature-aware hot night projection
            if f.min_temp is not None and f.min_temp >= 28.0:
                current_streak += 1
            else:
                current_streak = 0
            crs = compute_risk_score_v2(wbt, current_streak, [], risk_cfg)

        forward.append({
            "date": f.forecast_date,
            "type": "forecast",
            "composite_risk_score": crs["value"] if crs else 0.0,
            "risk_level": crs["state"] if crs else "Safe",
            "wbt": wbt,
            "hne": None,
        })

    return {
        "backward": backward,
        "forward": forward,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/warnings")
def get_active_warnings(db: Session = Depends(get_db)):
    """
    Return current active HKO weather warnings.
    """
    warnings = (
        db.query(models.WeatherWarning)
        .filter(models.WeatherWarning.status == "active")
        .order_by(models.WeatherWarning.issue_time.desc())
        .all()
    )
    return warnings


@router.get("/last-refresh")
def get_last_refresh_endpoint():
    """
    Return the timestamp and status of the last scheduled or manual refresh.
    Per D-03: includes timestamp and success boolean (and optional error on failure).
    """
    return get_last_refresh()


@router.post("/refresh")
@limiter.limit("3/minute")
async def manual_refresh(request: Request, db: Session = Depends(get_db)):
    """
    Manually trigger an immediate HKO data fetch and persistence.
    Returns a diagnostic summary of what was persisted.
    """
    from backend.services.weather_orchestrator import persist_weather_data
    from backend.services.hko_client import hko
    from backend.services.counters import increment_counter
    raw = await hko.fetch_all(lang="en")
    increment_counter(db, "hko_fetches")
    summary = persist_weather_data(db, raw)
    db.commit()
    _write_last_refresh(success=True)
    total_persisted = summary.get("readings_persisted", 0) + summary.get("forecast_days_persisted", 0)
    if total_persisted == 0:
        return {
            "success": True,
            "warning": "HKO returned no data. The external service may be temporarily unavailable or rate-limited.",
            "summary": summary,
        }
    return {"success": True, "summary": summary}


# ============================================================
# Alert endpoints (internal / future admin auth)
# ============================================================

@router.get("/alerts/unread", response_model=List[schemas.SystemAlertResponse])
def get_unread_alerts(
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """
    Return pending system alerts. Frontend polls this every 2 minutes.
    """
    alerts = (
        db.query(models.SystemAlert)
        .filter(models.SystemAlert.status == "pending")
        .order_by(models.SystemAlert.created_at.desc())
        .limit(limit)
        .all()
    )
    return alerts


@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    """
    Acknowledge a system alert so it is not returned by /alerts/unread again.
    """
    alert = db.query(models.SystemAlert).filter(models.SystemAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "alert_id": alert_id}


class _MetricsRequest(BaseModel):
    password: str = Field(..., min_length=1)


@router.post("/metrics")
def get_metrics(db: Session = Depends(get_db)):
    """
    Return cumulative generation impact counters.
    Public endpoint — no password required for viewing.
    """
    return get_all_counters(db)


@router.post("/metrics/last-reset")
def get_last_reset(db: Session = Depends(get_db)):
    """
    Return the timestamp of the most recent metrics reset.
    Public endpoint — no password required for viewing.
    """
    from backend.services.counters import get_last_reset_at
    ts = get_last_reset_at(db)
    return {
        "last_reset_at": ts.isoformat() if ts else None,
    }


@router.post("/verify-password")
@limiter.limit("5/minute")
def verify_password(request: Request, req: _MetricsRequest):
    """
    Verify the metrics/admin password without side effects.
    """
    if not _check_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid password",
        )
    return {"valid": True}


@router.get("/risk-config")
def get_public_risk_config(db: Session = Depends(get_db)):
    """
    Return the active risk formula configuration.
    Public endpoint — no auth required. Read-only.
    """
    return get_active_risk_config(db)
