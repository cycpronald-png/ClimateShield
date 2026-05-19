"""
Hot Night Excess (HNE) calculations.

Source: Guo, Y. T., Chan, K. H., Qiu, H., Wong, E. L. Y., & Ho, K. F.
(2024). The risk of hospitalization associated with hot nights and
excess nighttime heat in a subtropical metropolis: a time-series
study in Hong Kong, 2000–2019. The Lancet Regional Health –
Western Pacific, 51, 101168.

Definition:
  HNe = Σ [ max(0, T_h − 28°C) ]   for h ∈ night window
Night window: 20:00 of previous day to 07:59 of current day (12h).
Extreme threshold: HNe ≥ 17.7 °C·h (90th percentile in HK study).
"""
from typing import List

NIGHT_START_HOUR = 20
NIGHT_END_HOUR = 7   # inclusive up to 07:59
HNE_THRESHOLD = 17.7  # °C·h


def calculate_hne(hourly_temps: List[float], threshold: float = 28.0) -> float:
    """
    Calculate Hot Night Excess for a single night (ordered hourly temps).

    Args:
        hourly_temps: List of temperatures for the 20:00-07:59 window.
                      Typically 12 values (one per hour).
        threshold: Heat threshold in °C (default 28°C per HK).

    Returns:
        HNe in °C·h.
    """
    if not hourly_temps:
        return 0.0
    excesses = [max(0.0, float(t) - threshold) for t in hourly_temps if t is not None]
    return round(sum(excesses), 2)


def is_extreme_hne(hne: float) -> bool:
    """Return True if HNe meets or exceeds the 90th percentile threshold."""
    return hne >= HNE_THRESHOLD
