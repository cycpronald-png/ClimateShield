"""Shared database-access helpers for the weather router.

Hoisting these out of ``api/weather.py`` accomplishes two things:

1. Removes the in-loop N+1 risk in :func:`get_current_weather` and
   :func:`get_weather_trends` by allowing callers to batch
   ``get_active_risk_config`` and ``get_current_consecutive_hot_nights``
   once per request.
2. Gives the scoring logic a single seam to test, replacing the
   loop-with-side-effects pattern that previously mutated the SQLAlchemy
   session implicitly.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models
from backend.services.climate.scoring_v2 import compute_risk_score_v2
from backend.services.climate.hot_nights_tracker import (
    get_current_consecutive_hot_nights,
)
from backend.services.climate.wbt import calculate_wbt
from backend.services.risk_config_service import get_active_risk_config


# --------------------------------------------------------------------------- #
# Latest-reading-per-station                                                  #
# --------------------------------------------------------------------------- #

def get_latest_readings_per_station(
    db: Session, within_hours: int = 2
) -> List[models.WeatherReading]:
    """Return the most recent ``WeatherReading`` for each station seen in the
    last ``within_hours`` hours.
    """
    threshold = datetime.now(timezone.utc) - timedelta(hours=within_hours)
    latest = (
        db.query(
            models.WeatherReading.station,
            func.max(models.WeatherReading.id).label("latest_id"),
        )
        .filter(models.WeatherReading.recorded_at >= threshold)
        .group_by(models.WeatherReading.station)
        .subquery()
    )
    return (
        db.query(models.WeatherReading)
        .join(latest, models.WeatherReading.id == latest.c.latest_id)
        .order_by(models.WeatherReading.station)
        .all()
    )


# --------------------------------------------------------------------------- #
# Active warnings (deduplicated)                                             #
# --------------------------------------------------------------------------- #

def get_active_warnings_deduped(
    db: Session,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Return active HKO warnings collapsed to one entry per
    ``warning_type`` plus the list of seen type labels.

    Returns:
        (warnings_list, type_labels)
            warnings_list — list of ``{warning_type, signal}`` dicts
            type_labels   — distinct warning_type strings, insertion order
    """
    all_warnings = (
        db.query(models.WeatherWarning)
        .filter(models.WeatherWarning.status == "active")
        .all()
    )
    seen_types: set[str] = set()
    warnings_list: List[Dict[str, Any]] = []
    labels: List[str] = []
    for w in all_warnings:
        if w.warning_type in seen_types:
            continue
        seen_types.add(w.warning_type)
        warnings_list.append({"warning_type": w.warning_type, "signal": w.signal})
        labels.append(w.warning_type)
    return warnings_list, labels


# --------------------------------------------------------------------------- #
# Hot-night streak map                                                        #
# --------------------------------------------------------------------------- #

def get_consecutive_hot_nights_map(
    db: Session, today: str, stations: List[str]
) -> Dict[str, int]:
    """Return ``{station: consecutive_count}`` for the given stations
    using a single query instead of one query per station.
    """
    if not stations:
        return {}
    rows = (
        db.query(
            models.ConsecutiveHotNights.station,
            models.ConsecutiveHotNights.consecutive_count,
        )
        .filter(
            models.ConsecutiveHotNights.date == today,
            models.ConsecutiveHotNights.station.in_(stations),
        )
        .all()
    )
    return {row.station: row.consecutive_count for row in rows}


# --------------------------------------------------------------------------- #
# On-the-fly CRS recomputation                                               #
# --------------------------------------------------------------------------- #

def recompute_risk_for_reading(
    db: Session,
    reading: models.WeatherReading,
    risk_cfg: Dict[str, Any],
    today_hk: str,
    hot_night_map: Dict[str, int],
    warnings_list: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Compute and (optionally) persist a risk score for a single
    ``WeatherReading`` whose ``composite_risk_score`` is stale.

    Returns the v2 result dict, or ``None`` if no computation was possible.
    The caller is responsible for ``db.commit()`` after a batch.
    """
    wbt = reading.wet_bulb_temp_c
    if wbt is None and reading.temp_c is not None:
        rh = reading.humidity_pct if reading.humidity_pct is not None else 70.0
        wbt = calculate_wbt(reading.temp_c, rh)
        reading.wet_bulb_temp_c = wbt
        if reading.humidity_pct is None:
            reading.humidity_pct = rh
    if wbt is None:
        return None

    consecutive = hot_night_map.get(reading.station, 0)
    if consecutive == 0:
        consecutive = get_current_consecutive_hot_nights(db, reading.station, today_hk)
        hot_night_map[reading.station] = consecutive

    return compute_risk_score_v2(wbt, consecutive, warnings_list, risk_cfg)
