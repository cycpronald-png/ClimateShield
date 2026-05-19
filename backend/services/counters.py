"""
Generation Counters Service
Tracks cumulative lifetime totals for backend data-processing KPIs.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from backend import models

COUNTER_NAMES = {
    "hko_fetches",
    "weather_readings",
    "wbt_calculations",
    "risk_scores",
    "alerts_generated",
    "forecast_days",
    "warnings",
    "hne_checks",
}


def increment_counter(db: Session, name: str, amount: int = 1) -> int:
    """
    Atomically increment a named counter. Creates the row if absent.
    Returns the new total.
    """
    if name not in COUNTER_NAMES:
        raise ValueError(f"Unknown counter: {name}. Valid: {COUNTER_NAMES}")

    row = db.query(models.GenerationCounter).filter_by(name=name).with_for_update().first()
    if row:
        row.total += amount
    else:
        row = models.GenerationCounter(name=name, total=amount)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row.total


def get_all_counters(db: Session) -> dict:
    """Return all counter names and totals as a flat dict."""
    rows = db.query(models.GenerationCounter).all()
    result = {name: 0 for name in COUNTER_NAMES}
    for row in rows:
        result[row.name] = row.total
    return result


def get_counter(db: Session, name: str) -> int:
    """Return the current total for a single counter."""
    if name not in COUNTER_NAMES:
        raise ValueError(f"Unknown counter: {name}")
    row = db.query(models.GenerationCounter).filter_by(name=name).first()
    return row.total if row else 0


def get_last_reset_at(db: Session) -> Optional[datetime]:
    """Return the timestamp of the most recent counter reset."""
    row = (
        db.query(models.CounterResetLog)
        .order_by(models.CounterResetLog.reset_at.desc())
        .first()
    )
    return row.reset_at if row else None


def reset_counters(db: Session) -> None:
    """Reset all generation counters to zero and log the reset time."""
    for name in COUNTER_NAMES:
        row = db.query(models.GenerationCounter).filter_by(name=name).first()
        if row:
            row.total = 0
        else:
            db.add(models.GenerationCounter(name=name, total=0))
    db.add(models.CounterResetLog(reset_at=datetime.now(timezone.utc)))
    db.commit()
