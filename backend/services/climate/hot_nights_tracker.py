"""
Consecutive Hot Nights Tracker

Tracks per-station how many consecutive nights had a minimum temperature
above 28°C during the night window (20:00–07:59).

The night window is defined as 20:00 of the previous day through 07:59
of the current day (12 hours), following the HNE definition.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from backend import models

logger = logging.getLogger(__name__)

# Night window hours (HK time)
NIGHT_START_HOUR = 20
NIGHT_END_HOUR = 7  # inclusive up to 07:59
HOT_NIGHT_THRESHOLD = 28.0  # °C — minimum temp must exceed this


def _parse_date_str(dt: datetime) -> str:
    """Return YYYY-MM-DD string for a datetime."""
    return dt.strftime("%Y-%m-%d")


def get_night_window_bounds(target_date: str, tz_offset_hours: int = 8) -> tuple:
    """
    Given a target date (YYYY-MM-DD), return the UTC bounds of that night's
    observation window (20:00 previous day to 07:59 target day, HK time).

    Returns: (start_utc: datetime, end_utc: datetime)
    """
    # Parse target date as midnight HK time
    hk_tz = timezone(timedelta(hours=tz_offset_hours))
    target_dt = datetime.strptime(target_date, "%Y-%m-%d").replace(tzinfo=hk_tz)

    # Night starts at 20:00 previous day
    start_hk = target_dt - timedelta(days=1)
    start_hk = start_hk.replace(hour=NIGHT_START_HOUR, minute=0, second=0, microsecond=0)

    # Night ends at 07:59 target day
    end_hk = target_dt.replace(hour=NIGHT_END_HOUR, minute=59, second=59, microsecond=0)

    return start_hk.astimezone(timezone.utc), end_hk.astimezone(timezone.utc)


def compute_daily_hot_night_status(
    db: Session,
    date: str,
    station: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    For each station, determine if the night ending on `date` was a "hot night"
    (min temp in night window > 28°C).

    Returns:
        {
            "station_name": {
                "date": "2026-05-14",
                "min_temp": 29.5,
                "is_hot_night": True,
                "consecutive_count": 3,
            },
            ...
        }
    """
    start_utc, end_utc = get_night_window_bounds(date)

    # Query readings in the night window
    query = db.query(models.WeatherReading).filter(
        models.WeatherReading.recorded_at >= start_utc,
        models.WeatherReading.recorded_at <= end_utc,
    )
    if station:
        query = query.filter(models.WeatherReading.station == station)

    readings = query.all()

    # Group by station and find min temp per station
    station_temps = {}
    for r in readings:
        s = r.station
        if s not in station_temps:
            station_temps[s] = []
        if r.temp_c is not None:
            station_temps[s].append(float(r.temp_c))

    results = {}
    for s, temps in station_temps.items():
        if not temps:
            continue
        min_temp = min(temps)
        is_hot = min_temp > HOT_NIGHT_THRESHOLD

        # Find consecutive count
        consecutive = _count_consecutive_hot_nights(db, s, date, is_hot)

        results[s] = {
            "date": date,
            "min_temp": round(min_temp, 2),
            "is_hot_night": is_hot,
            "consecutive_count": consecutive,
        }

    return results


def _count_consecutive_hot_nights(
    db: Session,
    station: str,
    current_date: str,
    current_is_hot: bool,
) -> int:
    """
    Count how many consecutive nights ending on current_date were hot.
    If current_is_hot is False, return 0.
    If current_is_hot is True, return 1 + consecutive count from previous day.
    """
    if not current_is_hot:
        return 0

    # Look up previous day's record for this station
    prev_date_obj = datetime.strptime(current_date, "%Y-%m-%d") - timedelta(days=1)
    prev_date = prev_date_obj.strftime("%Y-%m-%d")

    prev_record = (
        db.query(models.ConsecutiveHotNights)
        .filter_by(station=station, date=prev_date)
        .first()
    )

    if prev_record and prev_record.is_hot_night:
        return prev_record.consecutive_count + 1
    return 1


def persist_hot_night_counts(
    db: Session,
    date: str,
    station: Optional[str] = None,
) -> int:
    """
    Compute and persist hot night counts for all (or one) station(s).
    Returns the number of records persisted/updated.
    """
    statuses = compute_daily_hot_night_status(db, date, station)
    count = 0
    for s, data in statuses.items():
        # Upsert: check if record exists
        existing = (
            db.query(models.ConsecutiveHotNights)
            .filter_by(station=s, date=date)
            .first()
        )
        if existing:
            existing.min_temp = data["min_temp"]
            existing.is_hot_night = data["is_hot_night"]
            existing.consecutive_count = data["consecutive_count"]
        else:
            record = models.ConsecutiveHotNights(
                station=s,
                date=date,
                min_temp=data["min_temp"],
                is_hot_night=data["is_hot_night"],
                consecutive_count=data["consecutive_count"],
            )
            db.add(record)
        count += 1
    db.commit()
    return count


def get_current_consecutive_hot_nights(
    db: Session,
    station: str,
    date: Optional[str] = None,
) -> int:
    """
    Get the consecutive hot nights count for a station on a given date.
    Defaults to today.
    """
    if date is None:
        date = _parse_date_str(datetime.now(timezone.utc))

    record = (
        db.query(models.ConsecutiveHotNights)
        .filter_by(station=station, date=date)
        .first()
    )
    return record.consecutive_count if record else 0


def backfill_hot_nights(
    db: Session,
    days: int = 30,
    station: Optional[str] = None,
) -> int:
    """
    Backfill hot night counts for the past N days.
    Useful when adding this feature to an existing database.
    """
    today = datetime.now(timezone.utc).date()
    total = 0
    for i in range(days):
        date_obj = today - timedelta(days=i)
        date_str = date_obj.strftime("%Y-%m-%d")
        count = persist_hot_night_counts(db, date_str, station)
        total += count
    return total
