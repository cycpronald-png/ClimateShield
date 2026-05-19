"""
Climate calculation domain package.

Re-exports all public APIs for convenience imports.
"""
from backend.services.climate.wbt import calculate_wbt, calculate_wbgt
from backend.services.climate.hne import calculate_hne, is_extreme_hne, HNE_THRESHOLD
from backend.services.climate.risk import (
    compute_risk_outlook,
    RiskOutlook,
    should_create_alert,
    aggregate_station_wbts,
)
from backend.services.climate.vocabulary import (  # noqa: F401
    RiskState,
    V1_TO_V2,
    normalize_risk_level,
)
from backend.services.climate.scoring import compute_risk_score_v2  # noqa: F401

__all__ = [
    "calculate_wbt",
    "calculate_wbgt",
    "calculate_hne",
    "is_extreme_hne",
    "HNE_THRESHOLD",
    "compute_risk_outlook",
    "RiskOutlook",
    "should_create_alert",
    "aggregate_station_wbts",
    "RiskState",
    "V1_TO_V2",
    "normalize_risk_level",
    "compute_risk_score_v2",
]