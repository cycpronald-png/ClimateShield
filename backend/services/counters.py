"""
Generation Counters Service
Tracks cumulative lifetime totals for backend data-processing KPIs.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session
from backend import models

# Canonical counter list, in display order. Used by ``get_all_counters``
# so the API response is always in a deterministic order, regardless of
# the row insertion sequence in the database.
COUNTER_NAMES = (
    "hko_fetches",
    "weather_readings",
    "wbt_calculations",
    "risk_scores",
    "alerts_generated",
    "forecast_days",
    "warnings",
    "hne_checks",
)
COUNTER_SET = frozenset(COUNTER_NAMES)


def increment_counter(db: Session, name: str, amount: int = 1) -> int:
    """
    Atomically increment a named counter. Creates the row if absent.
    Returns the new total.
    """
    if name not in COUNTER_SET:
        raise ValueError(f"Unknown counter: {name}. Valid: {sorted(COUNTER_SET)}")

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
    """Return all counter names and totals as a flat dict.

    Always returns exactly the 8 canonical keys in canonical order;
    missing rows surface as 0. Deterministic across requests so the
    Settings panel renders the same grid layout every load.
    """
    rows = db.query(models.GenerationCounter).all()
    by_name = {row.name: row.total for row in rows}
    return {name: int(by_name.get(name, 0)) for name in COUNTER_NAMES}


def get_counter(db: Session, name: str) -> int:
    """Return the current total for a single counter."""
    if name not in COUNTER_SET:
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
