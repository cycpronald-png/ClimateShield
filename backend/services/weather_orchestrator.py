"""
Weather Orchestrator
Parses HKO JSON responses, persists to DB, computes WBT/HNE/risk outlook,
and creates SystemAlerts when thresholds are breached.
"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import asdict

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from backend.services.hko_client import hko
from backend.services.open_meteo_client import OpenMeteoClient, open_meteo
from backend.services.counters import increment_counter
from backend.services.climate_engine import (
    calculate_wbt,
    calculate_hne,
    is_extreme_hne,
    compute_risk_outlook,
    compute_risk_score_v2,
    get_current_consecutive_hot_nights,
    persist_hot_night_counts,
    should_create_alert,
    RiskOutlook,
)
from backend.services.climate.vocabulary import normalize_risk_level
from backend.services.risk_config_service import get_active_risk_config
from backend.database import SessionLocal
from backend import models

# Monitored stations for ClimateShield Control Plane grid
MONITORED_STATIONS = {
    "Hong Kong Observatory",
    "Kai Tak Runway Park",
    "King's Park",
    "Kowloon City",
    "Sham Shui Po",
}


class WeatherOrchestrator:
    """
    Coordinates HKO data fetching, persistence, and Open-Meteo extension.
    Lifespan-managed singleton — do not instantiate per-request.
    """

    def __init__(self, open_meteo_client: OpenMeteoClient):
        self._open_meteo = open_meteo_client
        self._open_meteo_enabled = False

    async def get_extended_forecast(self, hko_forecast: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Append Open-Meteo days 10-14 to HKO forecast with computed risk scores.

        Returns a dict with keys:
            extended_forecast: list of forecast dicts (empty on error/unavailable)
            open_meteo_status: "ok" | "unavailable" | "error" | "disabled"
            open_meteo_message: str or None with details
        """
        if not self._open_meteo_enabled:
            return {
                "extended_forecast": hko_forecast,
                "open_meteo_status": "disabled",
                "open_meteo_message": "Extended forecast not enabled",
            }

        if not self._open_meteo.is_ready:
            logger.warning("OpenMeteoClient not initialized when get_extended_forecast called")
            return {
                "extended_forecast": [],
                "open_meteo_status": "unavailable",
                "open_meteo_message": "Open-Meteo service not available",
            }

        try:
            raw = await self._open_meteo.fetch_14day_forecast()
            if not raw or "daily" not in raw:
                logger.warning("Open-Meteo returned empty or invalid data")
                return {
                    "extended_forecast": [],
                    "open_meteo_status": "error",
                    "open_meteo_message": "Open-Meteo returned empty or invalid data",
                }
            daily = raw["daily"]
            times = daily.get("time", [])
            tmax = daily.get("temperature_2m_max", [])
            tmin = daily.get("temperature_2m_min", [])
            rh = daily.get("relative_humidity_2m_mean", [])
            for i in range(9, min(14, len(times))):
                max_temp = tmax[i] if i < len(tmax) else None
                min_temp = tmin[i] if i < len(tmin) else None
                rh_val = rh[i] if i < len(rh) else None
                # Compute WBT and CRS from O-M data
                wbt = None
                crs = None
                risk_level = "Unknown"
                # Load risk config for v2 scoring using a fresh DB session
                db_session = None
                try:
                    db_session = SessionLocal()
                    risk_cfg = get_active_risk_config(db_session)
                finally:
                    if db_session is not None:
                        db_session.close()
                if max_temp is not None and rh_val is not None:
                    wbt = calculate_wbt(max_temp, rh_val)
                    crs_result = compute_risk_score_v2(wbt, 0, [], risk_cfg)
                    crs = crs_result["value"]
                    risk_level = crs_result["state"]
                elif max_temp is not None:
                    rh_fb = rh_val if rh_val is not None else 70.0
                    wbt = calculate_wbt(max_temp, rh_fb)
                    crs_result = compute_risk_score_v2(wbt, 0, [], risk_cfg)
                    crs = crs_result["value"]
                    risk_level = crs_result["state"]
                hko_forecast.append({
                    "forecast_date": times[i].replace("-", ""),
                    "forecast_day_index": i,
                    "min_temp": min_temp,
                    "max_temp": max_temp,
                    "min_rh": rh_val,
                    "max_rh": rh_val,
                    "weather_desc": "Open-Meteo forecast",
                    "risk_level": risk_level,
                    "wind": None,
                    "psr": None,
                    "icon_code": None,
                    "composite_risk_score": crs,
                    "wet_bulb_peak": wbt,
                    "source": "open_meteo",
                })
            return {
                "extended_forecast": hko_forecast,
                "open_meteo_status": "ok",
                "open_meteo_message": None,
            }
        except httpx.HTTPStatusError as e:
            logger.warning("Open-Meteo HTTP error %s: %s", e.response.status_code, e)
            return {
                "extended_forecast": [],
                "open_meteo_status": "error",
                "open_meteo_message": f"Open-Meteo returned HTTP {e.response.status_code}",
            }
        except httpx.RequestError as e:
            logger.warning("Open-Meteo request error: %s", e)
            return {
                "extended_forecast": [],
                "open_meteo_status": "error",
                "open_meteo_message": "Open-Meteo service unreachable",
            }
        except Exception as e:
            logger.exception("Unexpected error fetching O-M forecast: %s", e)
            return {
                "extended_forecast": [],
                "open_meteo_status": "error",
                "open_meteo_message": f"Unexpected error: {type(e).__name__}",
            }

    def set_open_meteo_enabled(self, enabled: bool) -> None:
        self._open_meteo_enabled = enabled


def parse_hko_to_readings(data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse HKO rhrread JSON into flat reading dicts."""
    if not data:
        return []
    readings = []
    try:
        # HKO rhrread has blocks: temperature, humidity, rainfall, uvindex, wind
        current_time = data.get("updateTime") or data.get("recordTime")
        dt = _parse_iso_datetime(current_time) or datetime.now(timezone.utc)

        temps_data = data.get("temperature") or {}
        temps = temps_data.get("data", []) if isinstance(temps_data, dict) else []

        hum_data = data.get("humidity") or {}
        humidity = hum_data.get("data", []) if isinstance(hum_data, dict) else []

        rain_data = data.get("rainfall") or {}
        rainfall = rain_data.get("data", []) if isinstance(rain_data, dict) else []

        uv_data = data.get("uvindex") or {}
        uv = uv_data.get("data", []) if isinstance(uv_data, dict) else []

        wind_data = data.get("wind") or {}
        wind = wind_data.get("data", []) if isinstance(wind_data, dict) else []

        # Build lookup maps by place
        rh_map = {h.get("place"): h.get("value") for h in humidity}
        rain_map = {r.get("place"): r.get("max") for r in rainfall}
        uv_map = {u.get("place"): u.get("value") for u in uv}
        wind_map = {w.get("place"): w for w in wind}

        for t in temps:
            station = t.get("place")
            temp_c = t.get("value")
            if station is None or temp_c is None:
                continue
            rh = rh_map.get(station)
            # HKO often only reports humidity for the main observatory;
            # use it as a reasonable proxy for all HK districts.
            if rh is None:
                rh = rh_map.get("Hong Kong Observatory")
            wbt = calculate_wbt(temp_c, rh)
            wbm = wind_map.get(station, {})
            readings.append({
                "station": station,
                "district": hko.resolve_district(station),
                "temp_c": float(temp_c),
                "humidity_pct": float(rh) if rh is not None else None,
                "rainfall_mm": float(rain_map.get(station)) if station in rain_map and rain_map.get(station) is not None else None,
                "wind_kmh": float(wbm.get("speed")) if wbm.get("speed") is not None else None,
                "wind_direction": wbm.get("direction") or None,
                "uv_index": float(uv_map.get(station)) if uv_map and station in uv_map and uv_map.get(station) is not None else None,
                "wet_bulb_temp_c": wbt,
                "recorded_at": dt,
            })
    except Exception:
        logger.exception("Error parsing HKO data")
    return readings


def parse_hko_to_forecast(data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse HKO fnd JSON into forecast dicts."""
    if not data:
        return []
    forecasts = []
    try:
        for idx, day in enumerate(data.get("weatherForecast", [])):
            forecasts.append({
                "forecast_date": day.get("forecastDate"),
                "forecast_day_index": idx,
                "min_temp": _safe_float(day.get("forecastMintemp", {}).get("value")),
                "max_temp": _safe_float(day.get("forecastMaxtemp", {}).get("value")),
                "min_rh": _safe_float(day.get("forecastMinrh", {}).get("value")),
                "max_rh": _safe_float(day.get("forecastMaxrh", {}).get("value")),
                "weather_desc": day.get("forecastWeather"),
                "wind": day.get("forecastWind"),
                "psr": day.get("PSR"),
                "icon_code": day.get("ForecastIcon"),
                "risk_level": None,  # computed later
            })
    except Exception as e:
        logger.exception("Error parsing forecast")
    return forecasts


def parse_hko_to_warnings(data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse HKO warnsum JSON into warning dicts."""
    if not data:
        return []
    warnings = []
    try:
        # warnsum is a flat dict: { warning_type: { signal, issueTime, ... }, ... }
        for wtype, wdata in data.items():
            if not isinstance(wdata, dict):
                continue
            warnings.append({
                "warning_type": wtype,
                "signal": wdata.get("signal"),
                "description": wdata.get("desc", wtype),
                "issue_time": _parse_iso_datetime(wdata.get("issueTime")),
                "update_time": _parse_iso_datetime(wdata.get("updateTime")),
                "status": "active",
            })
    except Exception as e:
        logger.exception("Error parsing warnings")
    return warnings


async def seed_weather_data() -> Dict[str, Any]:
    """
    Immediate startup seed: fetch HKO data and persist before first scheduled job.
    Called from FastAPI lifespan to ensure DB is not empty on first page load.
    """
    from sqlalchemy.orm import Session
    import asyncio

    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        raw = await hko.fetch_all(lang="en")
        increment_counter(db, "hko_fetches")
        if raw.get("current"):
            summary = persist_weather_data(db, raw)
            db.commit()
            logger.info("HKO data seeded: %s", summary)
            return summary
        else:
            logger.warning("HKO returned no current data; skipping seed.")
            return {"message": "No current data from HKO"}
    except Exception:
        logger.exception("Failed to seed initial HKO data")
        return {"error": "Failed to seed initial HKO data"}
    finally:
        db.close()


def _is_hk_night_window(dt: datetime) -> bool:
    """Return True if dt falls in the HK night window (20:00-07:59 inclusive)."""
    hk_dt = dt.astimezone(timezone(timedelta(hours=8)))
    return hk_dt.hour >= 20 or hk_dt.hour <= 7


def _get_night_window_start(dt: datetime) -> datetime:
    """Return the 20:00 HK start time of the current night window as UTC."""
    hk_dt = dt.astimezone(timezone(timedelta(hours=8)))
    if hk_dt.hour >= 20:
        start_hk = hk_dt.replace(hour=20, minute=0, second=0, microsecond=0)
    else:
        start_hk = (hk_dt - timedelta(days=1)).replace(hour=20, minute=0, second=0, microsecond=0)
    return start_hk.astimezone(timezone.utc)


def persist_weather_data(db: Session, raw: Dict[str, Optional[Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Orchestrates HKO data persistence and alert generation in one DB transaction.
    Returns a diagnostic summary dict.
    """
    current_data = raw.get("current")
    forecast_data = raw.get("forecast")
    warnings_data = raw.get("warnings")

    result = {
        "readings_persisted": 0,
        "forecast_days_persisted": 0,
        "warnings_persisted": 0,
        "alerts_created": 0,
        "risk_7_day": None,
        "risk_9_day": None,
        "max_wbt": None,
    }

    # 1. Parse and enrich current weather readings with HNE
    readings = parse_hko_to_readings(current_data)
    for r in readings:
        r["nightly_hne"] = None
        recorded_at = r.get("recorded_at")
        if recorded_at is not None and _is_hk_night_window(recorded_at):
            window_start = _get_night_window_start(recorded_at)
            prior = (
                db.query(models.WeatherReading)
                .filter_by(station=r["station"])
                .filter(models.WeatherReading.recorded_at >= window_start)
                .filter(models.WeatherReading.recorded_at <= recorded_at)
                .all()
            )
            temps = [pr.temp_c for pr in prior if pr.temp_c is not None]
            if r.get("temp_c") is not None:
                temps.append(float(r["temp_c"]))
            r["hne"] = calculate_hne(temps)
            # Only count HNE checks for monitored stations
            if r["station"] in MONITORED_STATIONS:
                increment_counter(db, "hne_checks")
        else:
            r["hne"] = 0.0

    # 2. Parse warnings first (needed for reading AND forecast risk computation)
    warnings = parse_hko_to_warnings(warnings_data)

    # 2a. Load risk formula config and update hot night counts
    risk_cfg = get_active_risk_config(db)
    today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    try:
        persist_hot_night_counts(db, today_hk)
    except Exception:
        logger.exception("Failed to persist hot night counts")

    # Compute risk fields for each reading using v2 formula
    for r in readings:
        wbt = r.get("wet_bulb_temp_c")
        rh = r.get("humidity_pct")
        # Fallback: recompute WBT with default RH=70% if humidity is missing
        if wbt is None and r.get("temp_c") is not None:
            rh_fb = rh if rh is not None else 70.0
            wbt = calculate_wbt(r["temp_c"], rh_fb)
            r["wet_bulb_temp_c"] = wbt
            if rh is None:
                rh = 70.0
                r["humidity_pct"] = rh
        if wbt is not None:
            consecutive = get_current_consecutive_hot_nights(db, r["station"], today_hk)
            crs = compute_risk_score_v2(wbt, consecutive, warnings, risk_cfg)
            r["composite_risk_score"] = crs["value"]
            r["risk_level"] = crs["state"]
        else:
            r["composite_risk_score"] = None
            r["risk_level"] = "Safe"
        r["wet_bulb_peak"] = wbt

    max_wbt = None
    for r in readings:
        db.add(models.WeatherReading(**r))
        if r.get("wet_bulb_temp_c") is not None and (max_wbt is None or r["wet_bulb_temp_c"] > max_wbt):
            max_wbt = r["wet_bulb_temp_c"]
    result["readings_persisted"] = len(readings)
    result["max_wbt"] = max_wbt

    # 3. Persist forecast with computed WBT + v2 risk score
    #    Use per-station hot-night projections (temperature-aware)
    forecasts = parse_hko_to_forecast(forecast_data)

    # Build map: station -> current consecutive hot night count
    station_consecutive_map = {}
    for r in readings:
        station = r["station"]
        if station not in station_consecutive_map:
            station_consecutive_map[station] = get_current_consecutive_hot_nights(
                db, station, today_hk
            )

    # Score forecasts using the HKO Observatory as the representative station
    # All stations share the same forecast, so we project streaks based on
    # forecast min_temp for each day.
    rep_station = "Hong Kong Observatory"
    current_streak = station_consecutive_map.get(rep_station, 0)

    for f in forecasts:
        max_temp = f.get("max_temp")
        min_temp = f.get("min_temp")
        avg_rh = 70.0
        if f.get("max_rh") is not None and f.get("min_rh") is not None:
            avg_rh = (f["max_rh"] + f["min_rh"]) / 2.0
        if max_temp is None:
            f["wet_bulb_peak"] = None
            f["composite_risk_score"] = None
            f["risk_level"] = None
            db.add(models.WeatherForecastDay(**f))
            continue
        wbt = calculate_wbt(max_temp, avg_rh)

        # Temperature-aware hot night projection
        # If forecast min temp >= 28C, assume hot night continues
        if min_temp is not None and min_temp >= 28.0:
            current_streak += 1
        else:
            current_streak = 0

        crs = compute_risk_score_v2(wbt, current_streak, warnings, risk_cfg)
        f["wet_bulb_peak"] = wbt
        f["composite_risk_score"] = crs["value"]
        f["risk_level"] = crs["state"]
        db.add(models.WeatherForecastDay(**f))
    result["forecast_days_persisted"] = len(forecasts)

    # 4. Persist warnings with lifecycle management
    # Mark existing active warnings that are NOT in current response as inactive
    active_db_warnings = (
        db.query(models.WeatherWarning)
        .filter(models.WeatherWarning.status == "active")
        .all()
    )
    current_types = {w["warning_type"] for w in warnings}
    for db_w in active_db_warnings:
        if db_w.warning_type not in current_types:
            db_w.status = "inactive"
    # Persist new warnings — deduplicate by warning_type to avoid duplicates
    # Only add warnings that don't already have an active row in the DB
    existing_active_types = {db_w.warning_type for db_w in active_db_warnings}
    new_warnings = [w for w in warnings if w["warning_type"] not in existing_active_types]
    for w in new_warnings:
        db.add(models.WeatherWarning(**w))
    result["warnings_persisted"] = len(new_warnings)

    # 5. Update generation counters (impact KPIs) — scoped to monitored stations
    monitored_readings = [r for r in readings if r["station"] in MONITORED_STATIONS]
    if monitored_readings:
        increment_counter(db, "weather_readings", len(monitored_readings))
        increment_counter(db, "wbt_calculations", len(monitored_readings))
    if forecasts:
        increment_counter(db, "forecast_days", len(forecasts))
        increment_counter(db, "wbt_calculations", len(forecasts))
        increment_counter(db, "risk_scores", len(forecasts))
    if warnings:
        increment_counter(db, "warnings", len(warnings))

    # 6. Compute risk outlooks
    if forecasts:
        for days, key in [(7, "risk_7_day"), (9, "risk_9_day")]:
            outlook = compute_risk_outlook(forecasts, days)
            result[key] = {
                "outlook_days": outlook.outlook_days,
                "risk_level": outlook.risk_level,
                "avg_max_temp": outlook.avg_max_temp,
                "highest_max_temp": outlook.highest_max_temp,
                "avg_wet_bulb_temp": outlook.avg_wet_bulb_temp,
                "highest_wet_bulb_temp": outlook.highest_wet_bulb_temp,
                "advisory": outlook.advisory,
            }

    # 5. Auto-alert logic (WBT warnings, heat warnings)
    should_alert, alert_type, title, message = should_create_alert(
        wbt=max_wbt,
        hne=None,  # HNE requires hourly history; computed in daily job
        warnings=warnings,
    )
    if should_alert:
        # Determine district (HKO Observatory default if multi-district)
        district = "Hong Kong"  # broad alert; refine per-station in future
        if max_wbt is not None:
            if max_wbt >= 32.0:
                risk_level = "Purple"
            elif max_wbt >= 30.0:
                risk_level = "Red"
            elif max_wbt >= 28.0:
                risk_level = "Yellow"
            else:
                risk_level = "Safe"
        else:
            risk_level = "Red"
        _ensure_unique_alert(db, alert_type, title, message, district, risk_level)
        result["alerts_created"] += 1

    db.commit()
    return result


def run_hne_daily_check(db: Session) -> int:
    """
    Run once daily after 08:00 HK time.
    Computes HNE for the previous night (20:00-07:59) and creates alerts.
    Returns count of alerts created.
    """
    now = datetime.now(timezone.utc)
    # HK is UTC+8
    hk_now = now.astimezone(timezone(timedelta(hours=8)))
    # Previous night window: yesterday 20:00 to today 07:59
    end = hk_now.replace(hour=7, minute=59, second=0, microsecond=0)
    if hk_now.hour < 8:
        # If we're running before 08:00, look at the night before
        end = end - timedelta(days=1)
    start = end - timedelta(hours=12)
    # Normalize to UTC for reliable DB comparison across SQLite/PostgreSQL
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)

    # Query hourly readings for the window (we need at least hourly data ideally)
    # For MVP: if we only have HKO rhrread (10-min snapshots), we use the available readings
    # and interpolate / filter for nighttime hours.
    readings = (
        db.query(models.WeatherReading)
        .filter(models.WeatherReading.recorded_at >= start_utc)
        .filter(models.WeatherReading.recorded_at <= end_utc)
        .all()
    )

    if not readings:
        return 0

    # Group by station
    from collections import defaultdict
    station_temps = defaultdict(list)
    for r in readings:
        if r.temp_c is not None:
            station_temps[r.station].append(float(r.temp_c))

    alerts_created = 0
    for station, temps in station_temps.items():
        if len(temps) < 3:
            continue
        hne = calculate_hne(temps)
        if is_extreme_hne(hne):
            district = hko.resolve_district(station) or station
            _ensure_unique_alert(
                db,
                alert_type="hne_extreme",
                title=f"Extreme Hot Night Excess at {station}",
                message=f"HNE = {hne} °C·h (≥ {calculate_hne.__defaults__[0]} threshold). "
                        "Nighttime heat stress exceeds the 90th percentile. "
                        "Increase checks on indoor shelters and elderly.",
                district=district,
                risk_level="Purple",
            )
            alerts_created += 1
        for r in readings:
            if r.station == station:
                r.nightly_hne = hne

    db.commit()
    return alerts_created


# ============================================================
# Helpers
# ============================================================

def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        # Handle HKO format like "2026-04-25T09:45:00+08:00"
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _ensure_unique_alert(
    db: Session,
    alert_type: str,
    title: str,
    message: str,
    district: str,
    risk_level: str,
    target_group: str = "NGO Partners",
) -> None:
    """
    Prevent duplicate active alerts for the same type/region.
    If an unacknowledged alert already exists in the last 6h, skip.
    """
    six_hours_ago = datetime.now(timezone.utc) - timedelta(hours=6)
    existing = (
        db.query(models.SystemAlert)
        .filter(models.SystemAlert.alert_type == alert_type)
        .filter(models.SystemAlert.district == district)
        .filter(models.SystemAlert.status == "pending")
        .filter(models.SystemAlert.created_at >= six_hours_ago)
        .first()
    )
    if existing:
        return

    increment_counter(db, "alerts_generated")
    db.add(models.SystemAlert(
        alert_type=alert_type,
        title=title,
        message=message,
        district=district,
        risk_level=risk_level,
        status="pending",
        target_group=target_group,
        source_data={"auto_generated": True},
    ))


# Module-level singleton — wire in FastAPI lifespan
weather_orchestrator = WeatherOrchestrator(open_meteo_client=open_meteo)
