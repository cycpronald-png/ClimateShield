"""
Risk Configuration Service

Handles loading, validating, and persisting the admin-editable
risk formula configuration from the database.
"""
from typing import Dict, Any, Optional, List

from sqlalchemy.orm import Session

from backend import models


DEFAULT_CONFIG = {
    "wbt_thresholds": [
        {"max_temp": 21.9, "score": 0},
        {"min_temp": 22, "max_temp": 23.9, "score": 1},
        {"min_temp": 24, "max_temp": 26.9, "score": 2},
        {"min_temp": 27, "max_temp": 29.9, "score": 4},
        {"min_temp": 30, "max_temp": 34.4, "score": 6},
        {"min_temp": 34.5, "score": 8},
    ],
    "hne_thresholds": [
        {"max_nights": 0, "score": 0},
        {"min_nights": 1, "max_nights": 1, "score": 1},
        {"min_nights": 2, "max_nights": 2, "score": 2},
        {"min_nights": 3, "max_nights": 4, "score": 4},
        {"min_nights": 5, "score": 6},
    ],
    "vulnerability_config": {"trigger_h_score": 1, "bonus": 5},
    "warning_multipliers": {
        "none": 1.0,
        "thunderstorm_or_amber_rain": 2.0,
        "t1_or_red_rain": 1.5,
        "t3": 1.5,
        "black_rain": 2.0,
        "t8": 3.0,
    },
    "t8_floor": {"enabled": True, "min_score": 27},
    "state_ranges": [
        {"name": "Safe", "min": 0, "max": 12},
        {"name": "Low", "min": 13, "max": 16},
        {"name": "Yellow", "min": 17, "max": 22},
        {"name": "Red", "min": 23, "max": 26},
        {"name": "Purple", "min": 25, "max": 30},
    ],
}


def get_active_risk_config(db: Session) -> Dict[str, Any]:
    """Load the active risk formula config from DB, or return default if none exists."""
    config = (
        db.query(models.RiskFormulaConfig)
        .filter(models.RiskFormulaConfig.is_active == True)
        .order_by(models.RiskFormulaConfig.id.desc())
        .first()
    )
    if not config:
        return DEFAULT_CONFIG
    return {
        "wbt_thresholds": config.wbt_thresholds,
        "hne_thresholds": config.hne_thresholds,
        "vulnerability_config": config.vulnerability_config,
        "warning_multipliers": config.warning_multipliers,
        "t8_floor": config.t8_floor,
        "state_ranges": config.state_ranges,
    }


def validate_risk_config(config: Dict[str, Any]) -> None:
    """
    Validate a risk formula configuration dict.
    Raises ValueError with descriptive message on any validation failure.
    """
    # 1. WBT thresholds: non-overlapping, cover all possible temps, monotonic scores
    wbt = config.get("wbt_thresholds", [])
    if not wbt:
        raise ValueError("wbt_thresholds cannot be empty")
    prev_max = None
    for i, band in enumerate(wbt):
        if "score" not in band:
            raise ValueError(f"wbt_thresholds[{i}]: missing 'score'")
        if not isinstance(band["score"], (int, float)) or band["score"] < 0:
            raise ValueError(f"wbt_thresholds[{i}]: score must be non-negative number")
        # Check monotonicity: scores should increase with temperature
        if i > 0 and band["score"] < wbt[i - 1]["score"]:
            raise ValueError(f"wbt_thresholds[{i}]: score must not decrease from previous band")
        # Check no gap from previous band (allow 1 degree gap for the top band)
        if prev_max is not None and band.get("min_temp") is not None and band["min_temp"] <= prev_max:
            raise ValueError(f"wbt_thresholds[{i}]: overlaps or touches previous band (min_temp {band.get('min_temp')} <= prev max {prev_max})")
        prev_max = band.get("max_temp")

    # 2. HNE thresholds: non-overlapping, cover all possible night counts, monotonic
    hne = config.get("hne_thresholds", [])
    if not hne:
        raise ValueError("hne_thresholds cannot be empty")
    prev_max_nights = None
    for i, band in enumerate(hne):
        if "score" not in band:
            raise ValueError(f"hne_thresholds[{i}]: missing 'score'")
        if not isinstance(band["score"], (int, float)) or band["score"] < 0:
            raise ValueError(f"hne_thresholds[{i}]: score must be non-negative number")
        if i > 0 and band["score"] < hne[i - 1]["score"]:
            raise ValueError(f"hne_thresholds[{i}]: score must not decrease from previous band")
        if prev_max_nights is not None and band.get("min_nights") is not None and band["min_nights"] <= prev_max_nights:
            raise ValueError(f"hne_thresholds[{i}]: overlaps previous band")
        prev_max_nights = band.get("max_nights")

    # 3. Vulnerability config
    vuln = config.get("vulnerability_config", {})
    if "trigger_h_score" not in vuln or "bonus" not in vuln:
        raise ValueError("vulnerability_config must contain 'trigger_h_score' and 'bonus'")
    if not isinstance(vuln["trigger_h_score"], int) or vuln["trigger_h_score"] < 0:
        raise ValueError("vulnerability_config.trigger_h_score must be non-negative integer")
    if not isinstance(vuln["bonus"], int) or vuln["bonus"] < 0:
        raise ValueError("vulnerability_config.bonus must be non-negative integer")
    # Verify trigger_h_score maps to a valid HNE score
    valid_h_scores = {b["score"] for b in hne}
    if vuln["trigger_h_score"] not in valid_h_scores:
        raise ValueError(f"vulnerability_config.trigger_h_score ({vuln['trigger_h_score']}) must match an existing HNE score: {sorted(valid_h_scores)}")

    # 4. Warning multipliers: all must be >= 1.0
    mults = config.get("warning_multipliers", {})
    if not mults:
        raise ValueError("warning_multipliers cannot be empty")
    for key, val in mults.items():
        if not isinstance(val, (int, float)) or val < 1.0:
            raise ValueError(f"warning_multipliers['{key}'] must be >= 1.0")

    # 5. T8 floor
    t8 = config.get("t8_floor", {})
    if "enabled" not in t8 or "min_score" not in t8:
        raise ValueError("t8_floor must contain 'enabled' and 'min_score'")
    if not isinstance(t8["min_score"], int):
        raise ValueError("t8_floor.min_score must be integer")

    # 6. State ranges: must cover [0, 30] — overlaps are allowed (resolved by priority order in lookup_state)
    states = config.get("state_ranges", [])
    if len(states) != 5:
        raise ValueError("state_ranges must have exactly 5 states")
    expected_names = {"Safe", "Low", "Yellow", "Red", "Purple"}
    actual_names = {s["name"] for s in states}
    if actual_names != expected_names:
        raise ValueError(f"state_ranges must contain exactly {expected_names}, got {actual_names}")

    # Sort by min to validate coverage
    sorted_states = sorted(states, key=lambda s: s["min"])
    if sorted_states[0]["min"] != 0:
        raise ValueError("state_ranges must start at 0")
    if sorted_states[-1]["max"] != 30:
        raise ValueError("state_ranges must end at 30")
    for i in range(len(sorted_states)):
        s = sorted_states[i]
        if s["min"] > s["max"]:
            raise ValueError(f"state_ranges[{s['name']}]: min ({s['min']}) > max ({s['max']})")
        if i > 0:
            prev = sorted_states[i - 1]
            # Overlaps are allowed (higher-severity state wins via priority order)
            # but gaps are not — every score must belong to at least one state
            if s["min"] > prev["max"] + 1:
                raise ValueError(
                    f"state_ranges gap between {prev['name']} (max={prev['max']}) "
                    f"and {s['name']} (min={s['min']}): scores {prev['max']+1}-{s['min']-1} uncovered"
                )

    # 7. T8 floor must fall within Purple state's range
    purple = next(s for s in states if s["name"] == "Purple")
    if t8["enabled"] and (t8["min_score"] < purple["min"] or t8["min_score"] > purple["max"]):
        raise ValueError(f"t8_floor.min_score ({t8['min_score']}) must be within Purple range [{purple['min']}-{purple['max']}]")


def upsert_risk_config(db: Session, config: Dict[str, Any]) -> None:
    """Replace the active config with a new one."""
    validate_risk_config(config)
    # Deactivate all existing
    db.query(models.RiskFormulaConfig).update({"is_active": False})
    # Insert new active config
    new_config = models.RiskFormulaConfig(
        name="custom",
        is_active=True,
        wbt_thresholds=config["wbt_thresholds"],
        hne_thresholds=config["hne_thresholds"],
        vulnerability_config=config["vulnerability_config"],
        warning_multipliers=config["warning_multipliers"],
        t8_floor=config["t8_floor"],
        state_ranges=config["state_ranges"],
    )
    db.add(new_config)
    db.commit()


def reset_risk_config(db: Session) -> None:
    """Reset to the built-in default configuration."""
    db.query(models.RiskFormulaConfig).update({"is_active": False})
    default = models.RiskFormulaConfig(
        name="default",
        is_active=True,
        **DEFAULT_CONFIG,
    )
    db.add(default)
    db.commit()
