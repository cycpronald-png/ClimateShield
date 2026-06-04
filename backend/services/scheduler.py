"""
APScheduler Background Jobs for HKO Polling.
Uses AsyncIOScheduler and FastAPI lifespan (best practice per Context7 docs).
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from backend.database import engine, DATABASE_URL

logger = logging.getLogger(__name__)

from backend.database import SessionLocal
from backend.services.counters import increment_counter
from backend.services.hko_client import hko
from backend.services.weather_orchestrator import persist_weather_data, run_hne_daily_check
from backend.services.agent_event_bus import emit_agent_log
from backend.services.last_refresh import _write_last_refresh

# Global scheduler singleton
scheduler = AsyncIOScheduler(timezone="Asia/Hong_Kong")


async def _poll_and_persist() -> None:
    """
    Fetch all HKO data types concurrently and persist.
    Runs every 10 minutes.
    """
    db = SessionLocal()
    emit_agent_log("meteorologist", "action", "Starting HKO full poll...")
    try:
        raw = await hko.fetch_all(lang="en")
        increment_counter(db, "hko_fetches")
        summary = persist_weather_data(db, raw)
        emit_agent_log("meteorologist", "message", f"Poll complete: {summary.get('readings_persisted', 0)} readings persisted")
        logger.info("HKO poll completed: %s", summary)
    except Exception as e:
        emit_agent_log("meteorologist", "error", f"Poll failed: {e}")
        logger.exception("HKO poll error: %s", e)
    finally:
        db.close()


async def _daily_hne_check() -> None:
    """
    Daily HNE computation at 08:30 HK time.
    """
    db = SessionLocal()
    emit_agent_log("auditor", "action", "Starting daily HNE check...")
    try:
        count = run_hne_daily_check(db)
        emit_agent_log("auditor", "message", f"HNE daily check: {count} alerts created")
        logger.info("HNE daily check: %d alerts created", count)
    except Exception as e:
        emit_agent_log("auditor", "error", f"HNE check error: {e}")
        logger.exception("HNE check error: %s", e)
    finally:
        db.close()


async def _hourly_forecast_refresh() -> None:
    """
    Hourly forecast refresh (lighter than full current-weather poll).
    """
    db = SessionLocal()
    emit_agent_log("meteorologist", "action", "Starting hourly forecast refresh...")
    try:
        raw = await hko.fetch_all(lang="en")
        increment_counter(db, "hko_fetches")
        summary = persist_weather_data(db, raw)
        emit_agent_log("meteorologist", "message", f"Forecast refresh: {summary.get('readings_persisted', 0)} readings updated")
        logger.info("Hourly forecast refresh: %s", summary)
    except Exception as e:
        emit_agent_log("meteorologist", "error", f"Forecast refresh error: {e}")
        logger.exception("Forecast refresh error: %s", e)
    finally:
        db.close()


async def _scheduled_refresh(is_retry: bool = False, job_id: str | None = None) -> None:
    """
    Scheduled refresh wrapper for cron-triggered HKO fetches.
    Does NOT implement retry logic — that is handled in Plan 02.
    """
    db = SessionLocal()
    job_label = "retry" if is_retry else "scheduled"
    emit_agent_log("meteorologist", "action", f"Starting HKO {job_label} refresh...")
    try:
        raw = await hko.fetch_all(lang="en")
        increment_counter(db, "hko_fetches")
        summary = persist_weather_data(db, raw)
        _write_last_refresh(success=True)
        emit_agent_log("meteorologist", "message", f"{job_label} refresh complete: {summary.get('readings_persisted', 0)} readings")
        logger.info("HKO %s refresh completed: %s", job_label, summary)
    except Exception as e:
        emit_agent_log("meteorologist", "error", f"{job_label} refresh failed: {e}")
        logger.exception("HKO %s refresh error: %s", job_label, e)
        if not is_retry:
            retry_at = datetime.now(timezone.utc) + timedelta(hours=1)
            original_job_id = job_id or "unknown"
            retry_id = f"hko_retry_{original_job_id}"
            scheduler.add_job(
                func=_scheduled_refresh,
                trigger=DateTrigger(run_date=retry_at, timezone="Asia/Hong_Kong"),
                id=retry_id,
                name=f"HKO Retry {original_job_id}",
                kwargs={"is_retry": True, "job_id": original_job_id},
                replace_existing=True,
                max_instances=1,
                coalesce="latest",
                misfire_grace_time=300,
            )
            emit_agent_log("orchestrator", "message", f"Scheduled retry {retry_id} at {retry_at.isoformat()}")
            logger.info("Scheduled retry %s at %s", retry_id, retry_at)
    finally:
        db.close()


def checkpoint_wal():
    """Run WAL checkpoint to prevent unbounded WAL growth."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    try:
        with engine.connect() as conn:
            conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
            conn.commit()
        emit_agent_log("orchestrator", "message", "WAL checkpoint completed.")
    except Exception as e:
        emit_agent_log("orchestrator", "error", f"WAL checkpoint failed: {e}")
        logger.exception("WAL checkpoint failed: %s", e)


def start_scheduler() -> None:
    """Register jobs and start the scheduler. Idempotent."""
    if scheduler.running:
        return

    # WAL checkpoint every 6 hours
    scheduler.add_job(
        func=checkpoint_wal,
        trigger=IntervalTrigger(hours=6),
        id="wal_checkpoint",
        name="SQLite WAL Checkpoint",
        replace_existing=True,
        max_instances=1,
        coalesce="latest",
        misfire_grace_time=300,
    )

    # Every 10 minutes: full current weather + warnings
    scheduler.add_job(
        func=_poll_and_persist,
        trigger=IntervalTrigger(minutes=10, jitter=5),
        id="hko_poll_10min",
        name="HKO Full Poll (Current + Warnings)",
        replace_existing=True,
        max_instances=1,
        coalesce="latest",
        misfire_grace_time=60,
    )

    # Every 60 minutes: forecast refresh
    scheduler.add_job(
        func=_hourly_forecast_refresh,
        trigger=IntervalTrigger(minutes=60, jitter=5),
        id="hko_forecast_60min",
        name="HKO Forecast Refresh",
        replace_existing=True,
        max_instances=1,
        coalesce="latest",
        misfire_grace_time=60,
    )

    # Daily at 08:30 HK: HNE computation
    scheduler.add_job(
        func=_daily_hne_check,
        trigger=CronTrigger(hour=8, minute=30, timezone="Asia/Hong_Kong"),
        id="hne_daily_0830",
        name="Daily Hot Night Excess Check",
        replace_existing=True,
        max_instances=1,
        coalesce="latest",
        misfire_grace_time=300,
    )

    # Daily at 00:00, 06:00, 12:00, 18:00 HK: scheduled full refresh
    for hour in (0, 6, 12, 18):
        job_id = f"hko_scheduled_{hour:04d}"
        scheduler.add_job(
            func=_scheduled_refresh,
            trigger=CronTrigger(hour=hour, minute=0, timezone="Asia/Hong_Kong"),
            id=job_id,
            name=f"HKO Scheduled Refresh {hour:02d}:00",
            replace_existing=True,
            max_instances=1,
            coalesce="latest",
            misfire_grace_time=300,
            kwargs={"job_id": job_id},
        )

    # Immediate first run to seed data
    from asyncio import get_event_loop
    loop = get_event_loop()
    loop.create_task(_poll_and_persist())

    scheduler.start()
    emit_agent_log("orchestrator", "message", "APScheduler started with climate agent jobs.")
    logger.info("APScheduler started with HKO jobs.")


def shutdown_scheduler() -> None:
    if scheduler.running:
        emit_agent_log("orchestrator", "message", "APScheduler shutting down.")
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down.")
