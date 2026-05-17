"""
Tests for updated DEFAULT_CONFIG sensitivity thresholds.

SENS-01: Lower WBT thresholds — 24/27/30°C bands instead of 25.9/28.9/31.9°C
SENS-02: Lower HNE vulnerability trigger to H>=1 instead of H>=2
SENS-03: HNE scores shifted so H=1 is a valid score
"""
import pytest
import sys
import os

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.risk_config_service import DEFAULT_CONFIG, validate_risk_config
from services.climate.scoring_v2 import lookup_wbt_score, lookup_hne_score, compute_risk_score_v2


class TestWBTThresholdSensitivity:
    """SENS-01: Lower WBT thresholds activate at milder conditions."""

    def test_wbt_below_24_is_score_zero(self):
        """WBT 23.9°C → score 0 (below wb_t1=24)."""
        w = lookup_wbt_score(23.9, DEFAULT_CONFIG["wbt_thresholds"])
        assert w == 0

    def test_wbt_24_maps_to_score_2(self):
        """WBT 24.0°C → score 2 (24 <= WBT < 27). Key change: was 0 before."""
        w = lookup_wbt_score(24.0, DEFAULT_CONFIG["wbt_thresholds"])
        assert w == 2

    def test_wbt_27_maps_to_score_4(self):
        """WBT 27.0°C → score 4 (27 <= WBT < 30)."""
        w = lookup_wbt_score(27.0, DEFAULT_CONFIG["wbt_thresholds"])
        assert w == 4

    def test_wbt_30_maps_to_score_6(self):
        """WBT 30.0°C → score 6 (WBT >= 30)."""
        w = lookup_wbt_score(30.0, DEFAULT_CONFIG["wbt_thresholds"])
        assert w == 6

    def test_wbt_first_band_max_temp_is_23_9(self):
        """First WBT band upper bound is 23.9°C."""
        assert DEFAULT_CONFIG["wbt_thresholds"][0]["max_temp"] == 23.9

    def test_wbt_second_band_min_temp_is_24(self):
        """Second WBT band lower bound is 24°C."""
        assert DEFAULT_CONFIG["wbt_thresholds"][1]["min_temp"] == 24

    def test_wbt_second_band_max_temp_is_26_9(self):
        """Second WBT band upper bound is 26.9°C."""
        assert DEFAULT_CONFIG["wbt_thresholds"][1]["max_temp"] == 26.9


class TestHNEThresholdSensitivity:
    """SENS-02/03: Lower HNE trigger & shifted HNE scores."""

    def test_hne_0_nights_is_score_0(self):
        """0 consecutive nights → score 0."""
        h = lookup_hne_score(0, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 0

    def test_hne_1_night_is_score_1(self):
        """1 consecutive night → score 1. Key change: was 0 before."""
        h = lookup_hne_score(1, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 1

    def test_hne_2_nights_is_score_2(self):
        """2 consecutive nights → score 2. Was 1 before."""
        h = lookup_hne_score(2, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 2

    def test_hne_3_nights_is_score_4(self):
        """3 consecutive nights → score 4. Was 2 before."""
        h = lookup_hne_score(3, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 4

    def test_hne_5_plus_nights_is_score_6(self):
        """5+ consecutive nights → score 6. Was 4 before."""
        h = lookup_hne_score(5, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 6
        h = lookup_hne_score(10, DEFAULT_CONFIG["hne_thresholds"])
        assert h == 6


class TestVulnerabilityTriggerSensitivity:
    """SENS-02: Single hot night triggers vulnerability."""

    def test_trigger_h_score_is_1(self):
        """trigger_h_score = 1 (was 2)."""
        assert DEFAULT_CONFIG["vulnerability_config"]["trigger_h_score"] == 1

    def test_vulnerability_bonus_unchanged(self):
        """Vulnerability bonus remains 5."""
        assert DEFAULT_CONFIG["vulnerability_config"]["bonus"] == 5

    def test_one_hot_night_triggers_vulnerability(self):
        """H=1 triggers V=5 (was V=0 before because trigger was H>=2)."""
        result = compute_risk_score_v2(
            wbt=24.0,
            consecutive_hot_nights=1,
            active_warnings=[],
            config=DEFAULT_CONFIG,
        )
        assert result["v"] == 5

    def test_zero_hot_nights_no_vulnerability(self):
        """H=0 means V=0 (no vulnerability)."""
        result = compute_risk_score_v2(
            wbt=24.0,
            consecutive_hot_nights=0,
            active_warnings=[],
            config=DEFAULT_CONFIG,
        )
        assert result["v"] == 0


class TestConfigValidation:
    """Updated DEFAULT_CONFIG must pass validate_risk_config."""

    def test_default_config_validates(self):
        """validate_risk_config(DEFAULT_CONFIG) passes without error."""
        validate_risk_config(DEFAULT_CONFIG)  # Should not raise

    def test_trigger_h_score_matches_existing_hne_score(self):
        """trigger_h_score=1 must be a valid value in hne_thresholds scores."""
        valid_h_scores = {b["score"] for b in DEFAULT_CONFIG["hne_thresholds"]}
        assert 1 in valid_h_scores

    def test_state_ranges_unchanged(self):
        """State ranges remain unchanged."""
        states = DEFAULT_CONFIG["state_ranges"]
        assert len(states) == 5
        assert states[0]["name"] == "Safe"
        assert states[0]["min"] == 0
        assert states[0]["max"] == 12
        assert states[1]["name"] == "Low"
        assert states[2]["name"] == "Yellow"
        assert states[3]["name"] == "Red"
        assert states[4]["name"] == "Purple"