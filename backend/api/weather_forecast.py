"""GET /api/weather/forecast, /api/weather/risks, /api/weather/trends."""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.services.climate.wbt import calculate_wbt
from backend.services.climate_engine import (
    compute_risk_outlook,
    is_extreme_hne,
)
from backend.services.climate.hot_nights_tracker import (
    get_current_consecutive_hot_nights,
)
from backend.services.risk_config_service import get_active_risk_config
from backend.services.weather_orchestrator import WeatherOrchestrator, weather_orchestrator

router = APIRouter(tags=["weather"])


def _hko_forecast_dicts(db: Session) -> List[Dict[str, Any]]:
    """Return the latest fetched_at snapshot of ``WeatherForecastDay`` as plain dicts."""
    latest_subq = (
        db.query(
            models.WeatherForecastDay.forecast_day_index,
            func.max(models.WeatherForecastDay.fetched_at).label("latest_fetched_at"),
        )
        .group_by(models.WeatherForecastDay.forecast_day_index)
        .subquery()
    )
    rows = (
        db.query(models.WeatherForecastDay)
        .join(
            latest_subq,
            (models.WeatherForecastDay.forecast_day_index == latest_subq.c.forecast_day_index)
            & (models.WeatherForecastDay.fetched_at == latest_subq.c.latest_fetched_at),
        )
        .order_by(models.WeatherForecastDay.forecast_day_index)
        .all()
    )
    return [
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
        for f in rows
    ]


@router.get("/forecast", response_model=List[schemas.WeatherForecastDayBase])
async def get_forecast(
    beta_14day: bool = False,
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(lambda: weather_orchestrator),
):
    """Return the latest 9-day forecast (one row per ``forecast_day_index``).
    When ``beta_14day=true`` and Open-Meteo is enabled, include days 10–14.
    """
    hko_forecast = _hko_forecast_dicts(db)
    if beta_14day and orchestrator._open_meteo_enabled:
        extended = await orchestrator.get_extended_forecast(hko_forecast)
        result = extended.get("extended_forecast", [])
        return result if result else hko_forecast
    return hko_forecast


@router.get("/risks")
def get_risk_outlook(db: Session = Depends(get_db)):
    """7-day and 9-day computed risk summaries from persisted forecast data."""
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


@router.get("/trends")
def get_weather_trends(db: Session = Depends(get_db)):
    """Backward (last 7 days) + forward (9-day forecast) for the trends chart."""
    from backend.services.climate.hne import calculate_hne
    from backend.services.climate.scoring_v2 import compute_risk_score_v2

    since = datetime.now(timezone.utc) - timedelta(days=7)
    history_readings = (
        db.query(models.WeatherReading)
        .filter(models.WeatherReading.recorded_at >= since)
        .order_by(models.WeatherReading.recorded_at)
        .all()
    )

    # Group by date (one bucket per calendar day)
    hist_buckets: Dict[str, list] = {}
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
            station_name = group[0].station if group else None
            consecutive = get_current_consecutive_hot_nights(
                db, station_name, date_str
            )
            crs = compute_risk_score_v2(peak_wbt, consecutive, [], risk_cfg)

        backward.append({
            "date": date_str,
            "type": "history",
            "composite_risk_score": crs["value"] if crs else 0.0,
            "risk_level": crs["state"] if crs else "Safe",
            "wbt": peak_wbt,
            "hne": hne,
        })

    # Forward: 9-day forecast
    forecast_dicts = _hko_forecast_dicts(db)
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    # Hoist risk_cfg and hot-night lookup out of the loop (N+1 fix)
    risk_cfg = get_active_risk_config(db)
    current_streak = get_current_consecutive_hot_nights(
        db, "Hong Kong Observatory", today_hk
    )
    forward = []
    for f in forecast_dicts:
        if f.get("max_temp") is None:
            forward.append({
                "date": f["forecast_date"],
                "type": "forecast",
                "composite_risk_score": None,
                "risk_level": None,
                "wbt": None,
                "hne": None,
            })
            continue
        max_rh_fb = f["max_rh"] if f["max_rh"] is not None else 70
        min_rh_fb = f["min_rh"] if f["min_rh"] is not None else 70
        wbt = calculate_wbt(f["max_temp"], (max_rh_fb + min_rh_fb) / 2)
        if wbt is not None:
            # Temperature-aware hot-night projection
            if f.get("min_temp") is not None and f["min_temp"] >= 28.0:
                current_streak += 1
            else:
                current_streak = 0
            crs = compute_risk_score_v2(wbt, current_streak, [], risk_cfg)
        else:
            crs = None
        forward.append({
            "date": f["forecast_date"],
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
