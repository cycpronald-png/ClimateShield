"""
Risk levels, outlook computation, alert logic, and station aggregation.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple

import numpy as np

from backend.services.climate.wbt import calculate_wbt, calculate_wbgt
from backend.services.climate.hne import HNE_THRESHOLD, is_extreme_hne
from backend.services.climate.vocabulary import normalize_risk_level, RiskState
from backend.services.climate.scoring_v2 import compute_risk_score_v2
from backend.services.risk_config_service import DEFAULT_CONFIG


# ============================================================
# RISK LEVELS AND THRESHOLDS
# ============================================================

_WBT_CRITICAL = 32.0


# ============================================================
# RISK OUTLOOK (7-day and 9-day)
# ============================================================

@dataclass
class RiskOutlook:
    outlook_days: int
    risk_level: str
    avg_max_temp: Optional[float]
    avg_min_temp: Optional[float]
    avg_wet_bulb_temp: Optional[float]
    highest_wet_bulb_temp: Optional[float]
    highest_max_temp: Optional[float]
    average_humidity: Optional[float]
    advisory: Optional[str]


def compute_risk_outlook(
    forecast_days: List[Dict[str, Any]],
    days: int,
) -> RiskOutlook:
    """
    Compute risk outlook from a list of forecast dicts (HKO fnd format).
    Each dict must contain: max_temp, min_temp, max_rh (or min_rh).
    """
    if not forecast_days or days <= 0:
        return RiskOutlook(
            outlook_days=days,
            risk_level="Safe",
            avg_max_temp=None,
            avg_min_temp=None,
            avg_wet_bulb_temp=None,
            highest_wet_bulb_temp=None,
            highest_max_temp=None,
            average_humidity=None,
            advisory="Insufficient forecast data.",
        )

    window = forecast_days[:days]
    wbt_values = []
    max_temps = []
    min_temps = []
    humidity_values = []

    for day in window:
        max_t = day.get("max_temp")
        min_t = day.get("min_temp")
        max_rh = day.get("max_rh")
        min_rh = day.get("min_rh")

        if max_t is not None:
            max_temps.append(float(max_t))
            # Use average RH for WBT calculation
            rh_avg = ((max_rh if max_rh is not None else 0) + (min_rh if min_rh is not None else 0)) / 2.0
            rh = rh_avg if (max_rh is not None or min_rh is not None) else 70.0
            wb = calculate_wbt(float(max_t), rh)
            if wb is not None:
                wbt_values.append(wb)
            humidity_values.append(rh)

        if min_t is not None:
            min_temps.append(float(min_t))

    if not wbt_values:
        return RiskOutlook(
            outlook_days=days,
            risk_level="Safe",
            avg_max_temp=round(np.mean(max_temps), 1) if max_temps else None,
            avg_min_temp=round(np.mean(min_temps), 1) if min_temps else None,
            avg_wet_bulb_temp=None,
            highest_wet_bulb_temp=None,
            highest_max_temp=round(max(max_temps), 1) if max_temps else None,
            average_humidity=round(np.mean(humidity_values), 1) if humidity_values else None,
            advisory="Unable to compute wet-bulb temperatures. Using temperature proxy.",
        )

    avg_wbt = float(np.mean(wbt_values))
    highest_wbt = float(max(wbt_values))
    avg_max = round(np.mean(max_temps), 1) if max_temps else None
    avg_min = round(np.mean(min_temps), 1) if min_temps else None
    highest_max = round(max(max_temps), 1) if max_temps else None
    avg_hum = round(np.mean(humidity_values), 1) if humidity_values else None

    # Risk level is driven by the highest projected WBT in the window
    _crs = compute_risk_score_v2(highest_wbt, 0, [], DEFAULT_CONFIG)
    risk_level = _crs["state"]

    advisory = _generate_advisory(risk_level, highest_wbt, avg_max, days)

    return RiskOutlook(
        outlook_days=days,
        risk_level=risk_level,
        avg_max_temp=avg_max,
        avg_min_temp=avg_min,
        avg_wet_bulb_temp=round(avg_wbt, 2),
        highest_wet_bulb_temp=round(highest_wbt, 2),
        highest_max_temp=highest_max,
        average_humidity=avg_hum,
        advisory=advisory,
    )


def _generate_advisory(risk_level: str, highest_wbt: float, avg_max: Optional[float], days: int) -> str:
    base = f"{days}-Day Outlook: "
    if risk_level == "Purple":
        return (
            base
            + f"PURPLE heat stress projected (WBT ≥ {highest_wbt}°C). "
            "Immediate opening of cooling shelters advised. "
            "Outdoor workers and street sleepers at extreme risk."
        )
    if risk_level == "Red":
        return (
            base
            + f"RED heat stress projected (WBT ≈ {highest_wbt}°C). "
            "Increase patrols for vulnerable groups. Ensure water supplies are stocked."
        )
    if risk_level == "Yellow":
        return (
            base
            + f"YELLOW heat stress projected (WBT ≈ {highest_wbt}°C). "
            "Monitor elderly living alone and outdoor workers."
        )
    if risk_level == "Low":
        return (
            base
            + f"LOW heat stress projected (WBT ≈ {highest_wbt}°C). "
            "Mild conditions expected. Maintain standard summer precautions."
        )
    return (
        base
        + f"SAFE conditions projected (WBT ≈ {highest_wbt}°C). "
        "Normal summer conditions expected."
    )


# ============================================================
# AUTO-ALERT DECISION LOGIC
# ============================================================

def should_create_alert(
    wbt: Optional[float],
    hne: Optional[float],
    warnings: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[bool, str, str, str]:
    """
    Determine whether a system alert should be created.

    Returns: (should_alert: bool, alert_type: str, title: str, message: str)
    """
    # Priority 1: HKO Active Warnings
    if warnings:
        for w in warnings:
            w_type = str(w.get("warning_type", "")).lower()
            if "very hot" in w_type or "heat" in w_type:
                return (
                    True,
                    "heat_advisory",
                    "HKO Heat Warning Active",
                    f"The Hong Kong Observatory has issued a {w.get('warning_type', 'heat warning')}. "
                    "Review shelter readiness and patrol schedules.",
                )

    # Priority 2: Critical WBT
    if wbt is not None and wbt >= _WBT_CRITICAL:
        return (
            True,
            "wbt_critical",
            f"Purple Wet-Bulb Temperature (≥{_WBT_CRITICAL}°C)",
            f"WBT reached {wbt}°C. Immediate action required: open cooling shelters, "
            "suspend outdoor work, and check on street sleepers.",
        )

    # Priority 3: Extreme HNE
    if hne is not None and is_extreme_hne(hne):
        return (
            True,
            "hne_extreme",
            f"Extreme Hot Night Excess (≥{HNE_THRESHOLD} °C·h)",
            f"Last night's HNE was {hne} °C·h, indicating severe nighttime heat stress. "
            "Increase checks on elderly and indoor shelters without cooling.",
        )

    return False, "", "", ""


# ============================================================
# STATION-LEVEL WBT AGGREGATION
# ============================================================

def aggregate_station_wbts(readings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Given a list of weather reading dicts, compute WBT for each
    and annotate with risk level.

    Args:
        readings: List of dicts with keys station, district, temp_c, humidity_pct.

    Returns:
        Same list with added keys: wet_bulb_temp_c, risk_level, wbgt_c.
    """
    for r in readings:
        t = r.get("temp_c")
        rh = r.get("humidity_pct")
        wbt = calculate_wbt(t, rh)
        wbgt = calculate_wbgt(t, rh) if wbt is not None else None
        r["wet_bulb_temp_c"] = wbt
        r["wbgt_c"] = wbgt
        if wbt is not None:
            _score = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
            r["risk_level"] = _score["state"]
        else:
            r["risk_level"] = "Safe"
    return readings
