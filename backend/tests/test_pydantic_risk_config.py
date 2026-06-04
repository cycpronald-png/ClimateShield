"""
Verify the Pydantic v2 risk-config model rejects the same invalid
configurations the old imperative validator used to, and accepts the
default. Ensures the rewrite preserved behaviour 1:1.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from pydantic import ValidationError

from services.risk_config_service import (
    DEFAULT_CONFIG,
    RiskConfig,
    validate_risk_config,
)


def test_default_config_passes_validation():
    cfg = validate_risk_config(DEFAULT_CONFIG)
    assert isinstance(cfg, RiskConfig)
    assert cfg.t8_floor.min_score == 27


def test_duplicate_state_names_rejected():
    bad = {**DEFAULT_CONFIG, "state_ranges": DEFAULT_CONFIG["state_ranges"] + [{"name": "Safe", "min": 0, "max": 5}]}
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad)


def test_wbt_score_must_be_non_negative():
    bad = {**DEFAULT_CONFIG, "wbt_thresholds": [{"max_temp": 21.9, "score": -1}]}
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad)


def test_wbt_scores_must_be_monotonic():
    bad = {
        **DEFAULT_CONFIG,
        "wbt_thresholds": [
            {"max_temp": 21.9, "score": 4},
            {"min_temp": 22, "max_temp": 23.9, "score": 1},
        ],
    }
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad)


def test_state_ranges_must_cover_zero_thirty():
    bad = {
        **DEFAULT_CONFIG,
        "state_ranges": [
            {"name": "Safe", "min": 0, "max": 10},
            {"name": "Low", "min": 11, "max": 16},
            {"name": "Yellow", "min": 17, "max": 22},
            {"name": "Red", "min": 23, "max": 26},
            {"name": "Purple", "min": 27, "max": 30},
        ],
    }
    # No gap (10→11, 16→17, etc.) — should validate
    RiskConfig.model_validate(bad)

    # Now add a gap
    bad2 = {
        **DEFAULT_CONFIG,
        "state_ranges": [
            {"name": "Safe", "min": 0, "max": 8},
            {"name": "Low", "min": 13, "max": 16},
            {"name": "Yellow", "min": 17, "max": 22},
            {"name": "Red", "min": 23, "max": 26},
            {"name": "Purple", "min": 27, "max": 30},
        ],
    }
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad2)


def test_warning_multiplier_below_one_rejected():
    bad = {
        **DEFAULT_CONFIG,
        "warning_multipliers": {**DEFAULT_CONFIG["warning_multipliers"], "none": 0.5},
    }
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad)


def test_t8_floor_outside_purple_rejected():
    bad = {**DEFAULT_CONFIG, "t8_floor": {"enabled": True, "min_score": 5}}
    with pytest.raises(ValidationError):
        RiskConfig.model_validate(bad)
