"""
New Risk Score Engine v2 (Update_For.md formula)

RiskScore = min(30, (W + H + V) * M)

All thresholds, multipliers, and state boundaries are loaded from
the admin-editable RiskFormulaConfig in the database.
"""
from typing import Optional, Dict, Any, List


def lookup_wbt_score(wbt: float, thresholds: List[Dict[str, Any]]) -> int:
    """Map wet-bulb temperature to score using configurable thresholds."""
    for band in thresholds:
        min_t = band.get("min_temp")
        max_t = band.get("max_temp")
        # Check if wbt falls in this band
        in_band = True
        if min_t is not None and wbt < min_t:
            in_band = False
        if max_t is not None and wbt > max_t:
            in_band = False
        if in_band:
            return int(band["score"])
    # Fallback: if above all defined bands, return highest score
    if thresholds:
        return int(thresholds[-1]["score"])
    return 0


def lookup_hne_score(consecutive_nights: int, thresholds: List[Dict[str, Any]]) -> int:
    """Map consecutive hot nights count to H score using configurable thresholds."""
    for band in thresholds:
        min_n = band.get("min_nights")
        max_n = band.get("max_nights")
        in_band = True
        if min_n is not None and consecutive_nights < min_n:
            in_band = False
        if max_n is not None and consecutive_nights > max_n:
            in_band = False
        if in_band:
            return int(band["score"])
    # Fallback: if above all defined bands, return highest score
    if thresholds:
        return int(thresholds[-1]["score"])
    return 0


def lookup_warning_multiplier(warnings: List[Dict[str, Any]], multipliers: Dict[str, float]) -> float:
    """
    Determine the highest applicable warning multiplier.

    HKO warning types are matched against the keys in multipliers.
    The mapping is fuzzy: we check for substrings.
    """
    if not warnings:
        return multipliers.get("none", 1.0)

    warning_signals = []
    for w in warnings:
        w_type = str(w.get("warning_type", "")).lower()
        signal = str(w.get("signal", "")).lower()
        warning_signals.append((w_type, signal))

    # Priority order (highest multiplier first)
    priority_checks = [
        # T8: Gale or Storm Signal No. 8
        ("t8", lambda wt, sig: "signal no. 8" in wt or "gale or storm" in wt or "t8" in sig),
        # Black Rainstorm
        ("black_rain", lambda wt, sig: "black rainstorm" in wt or "black" in sig),
        # T3: Strong Wind Signal No. 3
        ("t3", lambda wt, sig: "signal no. 3" in wt or "strong wind" in wt or "t3" in sig),
        # T1 or Red Rainstorm
        ("t1_or_red_rain", lambda wt, sig: "standby signal no. 1" in wt or "signal no. 1" in wt or "red rainstorm" in wt or "red" in sig),
        # Thunderstorm or Amber Rainstorm
        ("thunderstorm_or_amber_rain", lambda wt, sig: "thunderstorm" in wt or "amber rainstorm" in wt or "amber" in sig),
    ]

    for key, check in priority_checks:
        for wt, sig in warning_signals:
            if check(wt, sig):
                return multipliers.get(key, multipliers.get("none", 1.0))

    return multipliers.get("none", 1.0)


def lookup_state(risk_score: float, state_ranges: List[Dict[str, Any]]) -> str:
    """Map risk score to state name using configurable ranges.
    
    Handles overlapping ranges by checking in descending severity order:
    Purple (highest) → Red → Yellow → Low → Safe (lowest).
    """
    score = round(risk_score)
    
    # Priority order for overlapping ranges (Purple takes precedence over Red at 25-26)
    priority_order = ["Purple", "Red", "Yellow", "Low", "Safe"]
    
    for priority_name in priority_order:
        for state in state_ranges:
            if state["name"] == priority_name:
                if state["min"] <= score <= state["max"]:
                    return state["name"]
    
    # Fallback: clamp to nearest state
    if score < 0:
        return "Safe"
    return "Purple"


def compute_risk_score_v2(
    wbt: float,
    consecutive_hot_nights: int,
    active_warnings: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute the new 0-30 risk score using the Update_For.md formula.

    Args:
        wbt: Wet-bulb temperature in °C
        consecutive_hot_nights: Number of consecutive nights with min temp > 28°C
        active_warnings: List of active HKO warning dicts
        config: Loaded risk formula config dict

    Returns:
        Dict with keys: value, state, w, h, v, m, breakdown, t8_applied
    """
    # Step 1: W from wet-bulb temperature
    w = lookup_wbt_score(wbt, config["wbt_thresholds"])

    # Step 2: H from consecutive hot nights
    h = lookup_hne_score(consecutive_hot_nights, config["hne_thresholds"])

    # Step 3: V — vulnerability constant
    vuln = config["vulnerability_config"]
    v = vuln["bonus"] if h >= vuln["trigger_h_score"] else 0

    # Step 4: M — highest active warning multiplier
    m = lookup_warning_multiplier(active_warnings, config["warning_multipliers"])

    # Step 5: Calculate base
    base = w + h + v
    raw_score = base * m

    # Step 6: T8 floor rule
    t8_applied = False
    t8 = config["t8_floor"]
    if t8["enabled"]:
        for w_item in active_warnings:
            w_type = str(w_item.get("warning_type", "")).lower()
            signal = str(w_item.get("signal", "")).lower()
            if "signal no. 8" in w_type or "gale or storm" in w_type or "t8" in signal:
                if raw_score < t8["min_score"]:
                    raw_score = t8["min_score"]
                    t8_applied = True
                break

    # Step 7: Cap at 30
    risk_score = min(30.0, raw_score)

    # Step 8: Map to state
    state = lookup_state(risk_score, config["state_ranges"])

    return {
        "value": round(risk_score, 1),
        "state": state,
        "w": w,
        "h": h,
        "v": v,
        "m": m,
        "t8_applied": t8_applied,
        "breakdown": f"({w} + {h} + {v}) × {m} = {base * m:.1f}" + (" → T8 floor applied" if t8_applied else ""),
    }
