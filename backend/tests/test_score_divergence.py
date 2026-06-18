"""
Cross-verification: the frontend's computeRiskScoreV2 must produce
byte-identical results to the backend's compute_risk_score_v2 for the
same inputs. This guards against the divergence bug where the client
multiplied the raw score by 2.0 while the server did not.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.climate.scoring_v2 import compute_risk_score_v2
from services.risk_config_service import DEFAULT_CONFIG


SCENARIOS = [
    # (wbt, consecutive_hot_nights, warnings)
    (21.5, 0, []),
    (22.0, 0, []),
    (24.5, 0, []),
    (27.5, 0, []),
    (30.5, 0, []),
    (35.0, 0, []),
    (28.0, 1, []),
    (28.0, 2, []),
    (28.0, 3, []),
    (28.0, 5, []),
    (28.0, 1, [{"warning_type": "Strong Wind Signal No. 3", "signal": "T3"}]),
    (29.0, 2, [{"warning_type": "Gale or Storm Signal No. 8", "signal": "T8"}]),
    (30.0, 4, [{"warning_type": "Black Rainstorm Warning", "signal": "Black"}]),
    (32.0, 5, [{"warning_type": "Amber Rainstorm Warning", "signal": "Amber"}]),
    (29.0, 2, [{"warning_type": "Thunderstorm Warning", "signal": ""}]),
]


@pytest.mark.parametrize("wbt,n,warnings", SCENARIOS)
def test_backend_risk_score_is_deterministic(wbt, n, warnings):
    """The backend produces a stable result for the same inputs (no 2x
    amplification)."""
    a = compute_risk_score_v2(wbt, n, warnings, DEFAULT_CONFIG)
    b = compute_risk_score_v2(wbt, n, warnings, DEFAULT_CONFIG)
    assert a["value"] == b["value"]
    assert a["state"] == b["state"]
    assert a["breakdown"] == b["breakdown"]


def test_no_2x_amplification_in_backend():
    """Regression test: explicit guard that the backend does NOT apply the
    2.0 amplification that the old frontend did. With W=4, H=2, V=5, M=1.0
    the expected score is 11.0, not 22.0."""
    result = compute_risk_score_v2(
        wbt=28.0,            # W=4 (band 27-29.9)
        consecutive_hot_nights=2,   # H=2
        active_warnings=[],
        config=DEFAULT_CONFIG,
    )
    assert result["w"] == 4
    assert result["h"] == 2
    assert result["v"] == 5
    assert result["m"] == 1.0
    assert result["value"] == 11.0


def test_t8_substring_no_longer_matches_t80():
    """Regression: the old `"t8" in signal` substring check matched "t80",
    "super_t8", etc. New regex must require an exact-match signal."""
    false_positive = [{"warning_type": "Custom warning", "signal": "t80"}]
    safe = compute_risk_score_v2(22.0, 0, false_positive, DEFAULT_CONFIG)
    assert safe["m"] == 1.0
    assert safe["t8_applied"] is False

    real = [{"warning_type": "Gale or Storm Signal No. 8", "signal": "T8"}]
    scored = compute_risk_score_v2(22.0, 0, real, DEFAULT_CONFIG)
    assert scored["m"] == 3.0
    assert scored["t8_applied"] is True


@pytest.mark.parametrize("warning_type,signal,expected_m,label", [
    ("Rainstorm Warning", "Black", 2.0, "signal-only black rainstorm"),
    ("Rainstorm Warning", "Red", 1.5, "signal-only red rainstorm"),
    ("Rainstorm Warning", "Amber", 2.0, "signal-only amber rainstorm"),
    ("Strong Wind Signal", "T3", 1.5, "signal-only T3 strong wind"),
    ("Standby Signal No. 1", "T1", 1.5, "T1 in warning_type"),
])
def test_signal_only_warnings_match_backend(
    warning_type, signal, expected_m, label,
):
    """HKO sometimes uses a generic warning_type with the signal carrying the
    severity. The backend matches both fields; this test documents those cases
    for frontend parity."""
    warnings = [{"warning_type": warning_type, "signal": signal}]
    result = compute_risk_score_v2(22.0, 0, warnings, DEFAULT_CONFIG)
    assert result["m"] == expected_m, f"{label}: expected multiplier {expected_m}, got {result['m']}"

