"""
Climate Calculation Engine — Backward-Compatible Re-Export Wrapper

This module re-exports all public APIs from the backend.services.climate
package so existing imports continue to work unchanged.

New code should prefer importing directly from the domain modules:
  from backend.services.climate.wbt import calculate_wbt
  from backend.services.climate.risk import compute_risk_outlook
"""

from backend.services.climate.wbt import calculate_wbt, calculate_wbgt  # noqa: F401
from backend.services.climate.hne import calculate_hne, is_extreme_hne, HNE_THRESHOLD  # noqa: F401
from backend.services.climate.risk import (  # noqa: F401
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
from backend.services.climate.scoring_v2 import compute_risk_score_v2  # noqa: F401
from backend.services.climate.hot_nights_tracker import (  # noqa: F401
    compute_daily_hot_night_status,
    persist_hot_night_counts,
    get_current_consecutive_hot_nights,
)