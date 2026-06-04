"""GET /api/weather/current — most recent reading per station."""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend import schemas
from backend.database import get_db
from backend.services.weather_queries import (
    get_active_warnings_deduped,
    get_consecutive_hot_nights_map,
    get_latest_readings_per_station,
    recompute_risk_for_reading,
)
from backend.services.risk_config_service import get_active_risk_config

router = APIRouter(tags=["weather"])


@router.get(
    "/current",
    response_model=List[schemas.WeatherReadingResponse],
    response_model_exclude_none=True,
)
def get_current_weather(db: Session = Depends(get_db)):
    """Return the most recent reading per station (last 2 hours).

    Recomputes the composite risk score on-the-fly for any reading where
    it is missing or stale (WBT ≥ first threshold but score still 0.0).
    """
    readings = get_latest_readings_per_station(db)
    if not readings:
        return []

    risk_cfg = get_active_risk_config(db)
    warnings_list, _ = get_active_warnings_deduped(db)
    stations = [r.station for r in readings]
    from datetime import datetime, timezone, timedelta
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    hot_night_map = get_consecutive_hot_nights_map(db, today_hk, stations)

    mutated = False
    for r in readings:
        crs_is_stale = (
            r.composite_risk_score is None
            or (r.composite_risk_score == 0.0 and r.wet_bulb_temp_c is not None)
        )
        if not crs_is_stale:
            continue
        result = recompute_risk_for_reading(
            db, r, risk_cfg, today_hk, hot_night_map, warnings_list
        )
        if result is not None:
            r.composite_risk_score = result["value"]
            r.risk_level = result["state"]
            mutated = True

    if mutated:
        db.commit()
    return readings
